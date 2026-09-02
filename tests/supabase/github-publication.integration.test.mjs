import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { applyBaselinePlan, executeLocalSql, queryLocalJson } from "../../tools/baseline/baseline-db.mjs";
import { buildBaselinePlan } from "../../tools/baseline/build-baseline.mjs";
import { buildFormalPublication, FORMAL_FILE_ALLOWLIST, sha256Hex } from "../../supabase/functions/_shared/formal-publication.ts";

const enabled=process.env.YIMI_RUN_GITHUB_PUBLICATION_INTEGRATION==="1";
const ACTOR="00000000-0000-4000-8000-000000000707";
const q=(value)=>`'${String(value).replaceAll("'","''")}'`;
const asRole=(role,sql,{commit=false}={})=>executeLocalSql(`begin; set local role ${role}; select set_config('request.jwt.claim.role',${q(role)},true); select set_config('request.jwt.claim.sub',${q(ACTOR)},true); ${sql}; ${commit?"commit":"rollback"};`);

test("Stage 7C local draft→snapshot→media ready→Draft PR mock→merge/Pages mock→finalize",{skip:!enabled,timeout:300_000},async()=>{
  applyBaselinePlan(await buildBaselinePlan());
  const baseline=queryLocalJson("select count(*)::integer items,(select count(*) from public.publication_snapshots)::integer snapshots,(select count(*) from public.content_drafts)::integer drafts,(select count(*) from public.media_assets)::integer media,(select count(*) from public.github_publications)::integer publications from public.content_items")[0];
  assert.deepEqual(baseline,{items:119,snapshots:119,drafts:0,media:714,publications:0});
  executeLocalSql(`insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at) values('00000000-0000-0000-0000-000000000000','${ACTOR}','authenticated','authenticated','stage7c-local@example.test','',now(),'{}','{}',now(),now()); insert into public.admin_users(user_id,email,is_active) values('${ACTOR}','stage7c-local@example.test',true);`);
  const beforePointer=queryLocalJson("select published_snapshot_id from public.content_items where public_id='CR-115-001'")[0].published_snapshot_id;
  let snapshotId=null,publicationId=null;
  try{
    asRole("authenticated","select public.get_or_create_content_draft((select id from public.content_items where public_id='CR-115-001'))",{commit:true});
    executeLocalSql("update public.content_drafts set status='validated',validation_result='{\"valid\":true,\"errors\":[],\"warnings\":[]}' where content_id=(select id from public.content_items where public_id='CR-115-001')");
    executeLocalSql(`with d as (select d.* from public.content_drafts d join public.content_items c on c.id=d.content_id where c.public_id='CR-115-001'), refs as (select nullif(d.data->>'coverAssetId','') reference,'cover' role,0::bigint ordinal from d where nullif(d.data->>'coverAssetId','') is not null union all select value,'gallery',ordinality from d,jsonb_array_elements_text(d.data->'galleryAssetIds') with ordinality), manifest as (select jsonb_agg(jsonb_build_object('id',coalesce(m.legacy_asset_key,m.id::text),'mediaId',m.id::text,'role',m.role::text,'sortOrder',r.ordinal,'source',m.source::text,'sha256',m.sha256,'legacyPath',m.legacy_path,'bucket',m.bucket,'objectPath',m.object_path,'originalMediaId',m.original_media_id,'mimeType',m.mime_type,'extension',m.extension,'byteSize',m.byte_size,'width',m.width,'height',m.height,'altText',m.alt_text,'caption',m.caption,'credit',m.credit,'rightsStatus',m.rights_status::text,'containsPortrait',m.contains_portrait,'portraitConsent',m.portrait_consent::text,'uploadStatus',m.upload_status::text) order by case r.role when 'cover' then 0 else 1 end,r.ordinal) value from d join refs r on true join public.media_assets m on m.content_id=d.content_id and m.role::text=r.role and (m.id::text=r.reference or m.legacy_asset_key=r.reference) and m.deleted_at is null) insert into public.publication_snapshots(content_id,source_draft_id,source_revision,schema_version,snapshot_data,public_data,media_manifest,publication_validation,checksum_sha256,status,created_by,snapshot_source) select d.content_id,d.id,d.revision,'1.1',d.data,d.data-'internalNotes',manifest.value,jsonb_build_object('valid',true,'revision',d.revision,'errors','[]'::jsonb,'warnings','[]'::jsonb),public.publication_snapshot_checksum('1.1',d.data-'internalNotes',manifest.value,d.revision),'ready','${ACTOR}','draft' from d,manifest`);
    snapshotId=queryLocalJson("select s.id from public.publication_snapshots s join public.content_items c on c.id=s.content_id where c.public_id='CR-115-001' and s.snapshot_source='draft'")[0].id;
    asRole("service_role",`select (public.begin_publication_media_preparation('${ACTOR}',${q(snapshotId)})).status`,{commit:true});
    asRole("service_role",`select (public.finalize_publication_media_preparation('${ACTOR}',${q(snapshotId)})).status`,{commit:true});
    const source=queryLocalJson(`select c.content_type::text,c.public_id,s.public_data,s.media_manifest,p.public_manifest,p.manifest_checksum_sha256,s.checksum_sha256,s.source_revision from public.publication_snapshots s join public.content_items c on c.id=s.content_id join public.publication_media_preparations p on p.publication_snapshot_id=s.id where s.id=${q(snapshotId)}`)[0];
    const baselineFiles=Object.fromEntries(await Promise.all(FORMAL_FILE_ALLOWLIST.map(async(path)=>[path,await readFile(path,"utf8")])));
    const output=buildFormalPublication({contentType:source.content_type,publicId:source.public_id,publicData:source.public_data,snapshotMediaManifest:source.media_manifest,publicMediaManifest:source.public_manifest,publicStorageBaseUrl:"https://project.example/storage/v1/object/public/cms-public",baselineFiles});
    const files=await Promise.all(FORMAL_FILE_ALLOWLIST.map(async path=>({path,sha256:await sha256Hex(output.files[path]),byteSize:new TextEncoder().encode(output.files[path]).length,changed:output.changedFiles.includes(path)})));
    const baseSha="a".repeat(40),branch=`publication/class-result/${source.public_id}/${source.checksum_sha256.slice(0,12)}`;
    const manifest={schemaVersion:"1.0",repositoryOwner:"yimi-Tian",repositoryName:"yimi-story",baseBranch:"main",baseSha,snapshotId, snapshotRevision:source.source_revision,snapshotChecksum:source.checksum_sha256,mediaManifestVersion:"1.1",mediaPreparationId:snapshotId,mediaManifestChecksum:source.manifest_checksum_sha256,contentType:source.content_type,publicId:source.public_id,changeType:output.changeType,changedFiles:output.changedFiles,beforeCounts:output.beforeCounts,afterCounts:output.afterCounts,files};
    asRole("service_role",`select public.begin_github_publication('${ACTOR}',${q(snapshotId)},${q(baseSha)},${q(branch)},${q(JSON.stringify(manifest))}::jsonb)`,{commit:true});
    publicationId=queryLocalJson(`select id from public.github_publications where snapshot_id=${q(snapshotId)}`)[0].id;
    assert.equal(queryLocalJson("select published_snapshot_id from public.content_items where public_id='CR-115-001'")[0].published_snapshot_id,beforePointer);
    const github={branch:null,commit:null,pr:null,merged:false,pages:"pending"};github.commit="b".repeat(40);github.branch=branch;github.pr={number:99,draft:true};
    asRole("service_role",`select public.record_github_publication_pr('${ACTOR}',${q(publicationId)},${q(github.commit)},99,'https://github.com/yimi-Tian/yimi-story/pull/99')`,{commit:true});
    assert.equal(github.pr.draft,true);assert.equal(github.merged,false);assert.equal(queryLocalJson(`select pr_state::text from public.github_publications where id=${q(publicationId)}`)[0].pr_state,"open");
    github.merged=true;const mergeSha="c".repeat(40);asRole("service_role",`select public.set_github_publication_state('${ACTOR}',${q(publicationId)},'deploy_pending',${q(mergeSha)},null)`,{commit:true});
    assert.equal(github.pages,"pending");assert.equal(queryLocalJson("select published_snapshot_id from public.content_items where public_id='CR-115-001'")[0].published_snapshot_id,beforePointer);
    github.pages="deployed";asRole("service_role",`select public.set_github_publication_state('${ACTOR}',${q(publicationId)},'deployed',${q(mergeSha)},null)`,{commit:true});
    asRole("service_role",`select public.finalize_github_publication('${ACTOR}',${q(publicationId)},${q(mergeSha)})`,{commit:true});
    assert.equal(queryLocalJson("select published_snapshot_id from public.content_items where public_id='CR-115-001'")[0].published_snapshot_id,snapshotId);
    asRole("service_role",`select public.finalize_github_publication('${ACTOR}',${q(publicationId)},${q(mergeSha)})`,{commit:true});
    assert.equal(queryLocalJson(`select pr_state::text from public.github_publications where id=${q(publicationId)}`)[0].pr_state,"finalized");
  }finally{
    executeLocalSql(`update public.content_items set published_snapshot_id=${q(beforePointer)} where public_id='CR-115-001'; delete from public.github_publications where snapshot_id=${snapshotId?q(snapshotId):"null"}; delete from public.publication_media_mappings where publication_snapshot_id=${snapshotId?q(snapshotId):"null"}; delete from public.publication_media_preparations where publication_snapshot_id=${snapshotId?q(snapshotId):"null"}; delete from public.publication_snapshots where id=${snapshotId?q(snapshotId):"null"}; delete from public.content_drafts where created_by='${ACTOR}'; delete from public.admin_users where user_id='${ACTOR}'; delete from auth.users where id='${ACTOR}';`);
  }
  assert.deepEqual(queryLocalJson("select count(*)::integer items,(select count(*) from public.publication_snapshots)::integer snapshots,(select count(*) from public.content_drafts)::integer drafts,(select count(*) from public.media_assets)::integer media,(select count(*) from public.github_publications)::integer publications from public.content_items")[0],baseline);
});
