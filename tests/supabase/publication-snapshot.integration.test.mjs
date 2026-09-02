import test from "node:test";
import assert from "node:assert/strict";
import { applyBaselinePlan, executeLocalSql, queryLocalJson } from "../../tools/baseline/baseline-db.mjs";
import { buildBaselinePlan } from "../../tools/baseline/build-baseline.mjs";

const enabled=process.env.YIMI_RUN_PUBLICATION_SNAPSHOT_INTEGRATION==="1";
const ACTIVE="00000000-0000-4000-8000-000000000701";
const q=(value)=>`'${String(value).replaceAll("'","''")}'`;
function asRole(role,sql,{commit=false}={}){const out=executeLocalSql(`begin; set local role ${role}; select set_config('request.jwt.claim.role',${q(role)},true); select set_config('request.jwt.claim.sub',${q(ACTIVE)},true); ${sql}; ${commit?"commit":"rollback"};`);return out;}
function preparationSql(publicId,expectedRevisionExpression="d.revision",checksumOverride=null,manifestExpression="manifest.value"){return `with d as (select d.* from public.content_drafts d join public.content_items c on c.id=d.content_id where c.public_id=${q(publicId)}), refs as (select d.id draft_id,nullif(d.data->>'coverAssetId','') reference,'cover' role,0::bigint ordinal from d where nullif(d.data->>'coverAssetId','') is not null union all select d.id,value,'gallery',ordinality from d,jsonb_array_elements_text(coalesce(d.data->'galleryAssetIds','[]')) with ordinality), manifest as (select coalesce(jsonb_agg(jsonb_build_object('id',coalesce(m.legacy_asset_key,m.id::text),'mediaId',m.id::text,'role',m.role::text,'sortOrder',r.ordinal,'source',m.source::text,'sha256',m.sha256,'legacyPath',m.legacy_path,'bucket',m.bucket,'objectPath',m.object_path,'originalMediaId',m.original_media_id,'mimeType',m.mime_type,'extension',m.extension,'byteSize',m.byte_size,'width',m.width,'height',m.height,'altText',m.alt_text,'caption',m.caption,'credit',m.credit,'rightsStatus',m.rights_status::text,'containsPortrait',m.contains_portrait,'portraitConsent',m.portrait_consent::text,'uploadStatus',m.upload_status::text) order by case r.role when 'cover' then 0 else 1 end,r.ordinal),'[]') value from d join refs r on r.draft_id=d.id join public.media_assets m on m.content_id=d.content_id and m.role::text=r.role and (m.id::text=r.reference or m.legacy_asset_key=r.reference) and m.deleted_at is null) select (public.prepare_publication_snapshot(${q(ACTIVE)},d.id,${expectedRevisionExpression},'1.1',d.data-'internalNotes',${manifestExpression},jsonb_build_object('valid',true,'revision',d.revision,'errors','[]'::jsonb,'warnings','[]'::jsonb,'mediaCount',jsonb_array_length(manifest.value),'coverReady',true,'exporterDeterministic',true),${checksumOverride??`public.publication_snapshot_checksum('1.1',d.data-'internalNotes',${manifestExpression},d.revision)`})).id from d,manifest`};

test("Stage 7A local immutable publication snapshot transaction與安全邊界實測",{skip:!enabled},async()=>{
  applyBaselinePlan(await buildBaselinePlan());
  executeLocalSql(`insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values('00000000-0000-0000-0000-000000000000','${ACTIVE}','authenticated','authenticated','publication-active@example.test','',now(),'{}','{}',now(),now()) on conflict(id) do nothing; insert into public.admin_users(user_id,email,is_active) values('${ACTIVE}','publication-active@example.test',true) on conflict(user_id) do update set is_active=true;`);
  const before=queryLocalJson("select count(*)::integer snapshots,(select count(*) from public.content_drafts)::integer drafts,(select count(*) from public.github_publications)::integer publications from public.publication_snapshots")[0];
  const pointers=queryLocalJson("select public_id,published_snapshot_id from public.content_items where public_id in ('CR-115-001','112-001') order by public_id");
  try {
    for(const publicId of ["CR-115-001","112-001"]){
      asRole("authenticated",`select public.get_or_create_content_draft((select id from public.content_items where public_id=${q(publicId)}))`,{commit:true});
      executeLocalSql(`update public.content_drafts set status='validated',validation_result='{"valid":true,"errors":[],"warnings":[]}' where content_id=(select id from public.content_items where public_id=${q(publicId)});`);
      asRole("service_role",preparationSql(publicId),{commit:true});
      asRole("service_role",preparationSql(publicId),{commit:true});
    }
    assert.equal(queryLocalJson("select count(*)::integer count from public.publication_snapshots where snapshot_source='draft'")[0].count,2);
    assert.equal(queryLocalJson("select count(*)::integer count from public.publication_snapshots where snapshot_source='draft' and public_data ? 'internalNotes'")[0].count,0);
    assert.equal(queryLocalJson(`select count(*)::integer count from public.publication_snapshots where snapshot_source='draft' and created_by='${ACTIVE}' and created_at is not null and status='ready'`)[0].count,2);
    assert.deepEqual(queryLocalJson("select public_id,published_snapshot_id from public.content_items where public_id in ('CR-115-001','112-001') order by public_id"),pointers);
    assert.throws(()=>asRole("service_role",preparationSql("CR-115-001","d.revision+1")),/draft revision changed/i);
    assert.throws(()=>asRole("service_role",preparationSql("CR-115-001","d.revision",q("0".repeat(64)))),/checksum mismatch/i);
    assert.throws(()=>asRole("service_role",preparationSql("CR-115-001","d.revision",null,"jsonb_set(manifest.value,'{0,altText}','\"偽造替代文字\"')")),/media manifest mismatch/i);
    assert.throws(()=>asRole("service_role",preparationSql("CR-115-001","d.revision",null,"jsonb_set(manifest.value,'{0,width}','999'::jsonb)")),/media manifest mismatch/i);
    assert.throws(()=>asRole("authenticated",preparationSql("CR-115-001")),/service operation required|permission denied/i);
    assert.throws(()=>asRole("authenticated",`insert into public.publication_snapshots(content_id,source_revision,schema_version,snapshot_data,media_manifest,checksum_sha256,status,created_by,snapshot_source) values((select id from public.content_items limit 1),1,'1.0','{}','[]',repeat('a',64),'ready','${ACTIVE}','draft')`),/row-level security|permission denied/i);
    assert.throws(()=>asRole("authenticated",`update public.publication_snapshots set status='failed' where snapshot_source='draft'`),/row-level security|permission denied/i);
    assert.throws(()=>asRole("authenticated",`delete from public.publication_snapshots where snapshot_source='draft'`),/row-level security|permission denied/i);
    const frozen=queryLocalJson("select snapshot_data->>'title' title from public.publication_snapshots s join public.content_items c on c.id=s.content_id where c.public_id='CR-115-001' and s.snapshot_source='draft'")[0].title;
    executeLocalSql(`update public.content_drafts set data=jsonb_set(data,'{title}','"草稿後續修改"'),status='draft',validation_result='{"valid":false,"errors":[],"warnings":[]}' where content_id=(select id from public.content_items where public_id='CR-115-001');`);
    assert.equal(queryLocalJson("select snapshot_data->>'title' title from public.publication_snapshots s join public.content_items c on c.id=s.content_id where c.public_id='CR-115-001' and s.snapshot_source='draft'")[0].title,frozen);
    assert.throws(()=>asRole("service_role",preparationSql("CR-115-001")),/validated draft required/i);
  } finally {
    executeLocalSql(`delete from public.publication_snapshots where snapshot_source='draft' and created_by='${ACTIVE}'; delete from public.content_drafts where created_by='${ACTIVE}'; delete from public.admin_users where user_id='${ACTIVE}'; delete from auth.users where id='${ACTIVE}';`);
  }
  const after=queryLocalJson("select count(*)::integer snapshots,(select count(*) from public.content_drafts)::integer drafts,(select count(*) from public.github_publications)::integer publications from public.publication_snapshots")[0];
  assert.deepEqual(after,before);assert.equal(after.snapshots,119);assert.equal(queryLocalJson("select count(*)::integer count from public.media_assets")[0].count,714);
});
