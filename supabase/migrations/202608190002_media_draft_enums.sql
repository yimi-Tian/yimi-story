begin;

alter type public.media_source add value if not exists 'cms_draft';
alter type public.media_source add value if not exists 'cms_public';
alter type public.media_rights_status add value if not exists 'owned';
alter type public.media_rights_status add value if not exists 'authorized';
alter type public.media_rights_status add value if not exists 'unknown';

commit;
