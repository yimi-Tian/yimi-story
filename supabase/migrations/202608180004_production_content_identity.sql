begin;

create function public.protect_content_item_identity()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if new.content_type is distinct from old.content_type
    or new.public_id is distinct from old.public_id
    or new.created_by is distinct from old.created_by
  then
    raise exception 'content item identity and provenance are immutable';
  end if;
  return new;
end;
$$;

create trigger content_items_protect_identity
before update on public.content_items
for each row execute function public.protect_content_item_identity();

drop policy content_items_update_active_admin on public.content_items;
create policy content_items_update_active_admin on public.content_items
for update to authenticated
using (public.is_active_admin())
with check (public.is_active_admin());

comment on function public.protect_content_item_identity() is
  'Prevents browser or service updates from rewriting content_type, public_id, or created_by provenance.';

commit;
