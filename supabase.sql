-- Run in Supabase > SQL Editor
create table categories(id bigint generated always as identity primary key,name text unique not null);
create table suppliers(id bigint generated always as identity primary key,name text not null,contact text,phone text,email text,address text);
create table products(id bigint generated always as identity primary key,name text not null,sku text,barcode text unique,
 category_id bigint references categories on delete set null,supplier_id bigint references suppliers on delete set null,
 cost numeric default 0,price numeric default 0,qty int default 0 check(qty>=0),min_qty int default 5,image_url text,created_at timestamptz default now());
create table movements(id bigint generated always as identity primary key,product_id bigint references products on delete cascade,
 type text check(type in('in','out')),qty int not null check(qty>0),reason text,note text,unit_price numeric default 0,created_at timestamptz default now());
create table settings(id int primary key default 1 check(id=1),company text default 'My Company',currency text default '₹',low_stock int default 5);
insert into settings(id) values(1);

create or replace function move_stock(p_id bigint,p_type text,p_qty int,p_reason text,p_note text) returns void
language plpgsql as $$
declare pr products;
begin
 update products set qty=qty+(case when p_type='in' then p_qty else -p_qty end) where id=p_id returning * into pr;
 if not found then raise exception 'Product not found'; end if;
 insert into movements(product_id,type,qty,reason,note,unit_price)
 values(p_id,p_type,p_qty,p_reason,p_note,case when p_type='in' then pr.cost else pr.price end);
end $$;

do $$ declare t text; begin
 foreach t in array array['categories','suppliers','products','movements','settings'] loop
  execute format('alter table %I enable row level security',t);
  execute format('create policy "auth all" on %I for all to authenticated using(true) with check(true)',t);
 end loop; end $$;

insert into storage.buckets(id,name,public) values('product-images','product-images',true);
create policy "img read" on storage.objects for select using(bucket_id='product-images');
create policy "img write" on storage.objects for insert to authenticated with check(bucket_id='product-images');
create policy "img del" on storage.objects for delete to authenticated using(bucket_id='product-images');
