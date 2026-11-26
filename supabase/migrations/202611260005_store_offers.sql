begin;
-- Administrative names and hierarchy: https://github.com/MIMAXUZ/uzbekistan-regions-data/tree/master/JSON
create table public.store_areas (id integer primary key, region text not null, locality text not null);
insert into public.store_areas values
(16,'Andijon viloyati','Oltinko’l tumani'),
(17,'Andijon viloyati','Andijon tumani'),
(18,'Andijon viloyati','Baliqchi tumani'),
(19,'Andijon viloyati','Bo’z tumani'),
(20,'Andijon viloyati','Buloqboshi tumani'),
(21,'Andijon viloyati','Jalaquduq tumani'),
(22,'Andijon viloyati','Izboskan tumani'),
(23,'Andijon viloyati','Ulug’nor tumani'),
(24,'Andijon viloyati','Qo’rg’ontepa tumani'),
(25,'Andijon viloyati','Asaka tumani'),
(26,'Andijon viloyati','Marxamat tumani'),
(27,'Andijon viloyati','Shahrixon tumani'),
(28,'Andijon viloyati','Paxtaobod tumani'),
(29,'Andijon viloyati','Xo’jaobod tumani'),
(30,'Andijon viloyati','Andijon shahri'),
(31,'Andijon viloyati','Xonobod shahri'),
(32,'Buxoro viloyati','Olot tumani'),
(33,'Buxoro viloyati','Buxoro tumani'),
(34,'Buxoro viloyati','Vobkent tumani'),
(35,'Buxoro viloyati','G’ijduvon tumani'),
(36,'Buxoro viloyati','Kogon tumani'),
(37,'Buxoro viloyati','Qorako’l tumani'),
(38,'Buxoro viloyati','Qorovulbozor tumani'),
(39,'Buxoro viloyati','Peshku tumani'),
(40,'Buxoro viloyati','Romitan tumani'),
(41,'Buxoro viloyati','Jondor tumani'),
(42,'Buxoro viloyati','Shofirkon tumani'),
(43,'Buxoro viloyati','Buxoro shahri'),
(44,'Buxoro viloyati','Kogon shahri'),
(45,'Jizzax viloyati','Arnasoy tumani'),
(46,'Jizzax viloyati','Baxmal tumani'),
(47,'Jizzax viloyati','G’allaorol tumani'),
(49,'Jizzax viloyati','Do’stlik tumani'),
(50,'Jizzax viloyati','Zomin tumani'),
(51,'Jizzax viloyati','Zarbdor tumani'),
(52,'Jizzax viloyati','Mirzacho’l tumani'),
(53,'Jizzax viloyati','Zafarobod tumani'),
(54,'Jizzax viloyati','Paxtakor tumani'),
(55,'Jizzax viloyati','Forish tumani'),
(56,'Jizzax viloyati','Yangiobod tumani'),
(57,'Jizzax viloyati','Jizzax shahri'),
(2905,'Jizzax viloyati','Sh.Rashidov tumani'),
(58,'Qashqadaryo viloyati','G’uzor tumani'),
(59,'Qashqadaryo viloyati','Dehqonobod tumani'),
(60,'Qashqadaryo viloyati','Qamashi tumani'),
(61,'Qashqadaryo viloyati','Qarshi tumani'),
(62,'Qashqadaryo viloyati','Koson tumani'),
(63,'Qashqadaryo viloyati','Kitob tumani'),
(64,'Qashqadaryo viloyati','Mirishkor tumani'),
(65,'Qashqadaryo viloyati','Muborak tumani'),
(66,'Qashqadaryo viloyati','Nishon tumani'),
(67,'Qashqadaryo viloyati','Kasbi tumani'),
(68,'Qashqadaryo viloyati','Chiroqchi tumani'),
(69,'Qashqadaryo viloyati','Shahrisabz tumani'),
(70,'Qashqadaryo viloyati','Yakkabog’ tumani'),
(71,'Qashqadaryo viloyati','Qarshi shahri'),
(72,'Qashqadaryo viloyati','Shahrisabz shahri'),
(8591,'Qashqadaryo viloyati','Ko‘kdala tumani'),
(73,'Navoiy viloyati','Konimex tumani'),
(74,'Navoiy viloyati','Qiziltepa tumani'),
(75,'Navoiy viloyati','Navbahor tumani'),
(76,'Navoiy viloyati','Karmana tumani'),
(77,'Navoiy viloyati','Nurota tumani'),
(78,'Navoiy viloyati','Tomdi tumani'),
(79,'Navoiy viloyati','Uchquduq tumani'),
(80,'Navoiy viloyati','Xatirchi tumani'),
(81,'Navoiy viloyati','Navoiy shahri'),
(2939,'Navoiy viloyati','Zarafshon shahri'),
(8584,'Navoiy viloyati','G‘ozg‘on tumani'),
(83,'Namangan viloyati','Mingbuloq tumani'),
(84,'Namangan viloyati','Kosonsoy tumani'),
(85,'Namangan viloyati','Namangan tumani'),
(86,'Namangan viloyati','Norin tumani'),
(87,'Namangan viloyati','Pop tumani'),
(88,'Namangan viloyati','To’raqo’rg’on tumani'),
(89,'Namangan viloyati','Uychi tumani'),
(90,'Namangan viloyati','Uchqo’rg’on tumani'),
(91,'Namangan viloyati','Chortoq tumani'),
(92,'Namangan viloyati','Chust tumani'),
(93,'Namangan viloyati','Yangiqo’rg’on tumani'),
(94,'Namangan viloyati','Namangan shahri'),
(8595,'Namangan viloyati','Davlatobod tumani'),
(8601,'Namangan viloyati','Yangi Namangan tumani'),
(95,'Samarqand viloyati','Oqdaryo tumani'),
(96,'Samarqand viloyati','Bulung’ur tumani'),
(97,'Samarqand viloyati','Jomboy tumani'),
(98,'Samarqand viloyati','Ishtixon tumani'),
(99,'Samarqand viloyati','Kattaqo’rg’on tumani'),
(100,'Samarqand viloyati','Qo’shrabot tumani'),
(101,'Samarqand viloyati','Narpay tumani'),
(102,'Samarqand viloyati','Payariq tumani'),
(103,'Samarqand viloyati','Pastdarg’om tumani'),
(104,'Samarqand viloyati','Paxtachi tumani'),
(105,'Samarqand viloyati','Samarqand tumani'),
(106,'Samarqand viloyati','Nurobod tumani'),
(107,'Samarqand viloyati','Urgut tumani'),
(108,'Samarqand viloyati','Tayloq tumani'),
(109,'Samarqand viloyati','Samarqand shahri'),
(110,'Samarqand viloyati','Kattaqo’rg’on shahri'),
(125,'Sirdaryo viloyati','Oqoltin tumani'),
(126,'Sirdaryo viloyati','Boyovut tumani'),
(127,'Sirdaryo viloyati','Sayxunobod tumani'),
(128,'Sirdaryo viloyati','Guliston tumani'),
(129,'Sirdaryo viloyati','Sardoba tumani'),
(130,'Sirdaryo viloyati','Mirzaobod tumani'),
(131,'Sirdaryo viloyati','Sirdaryo tumani'),
(132,'Sirdaryo viloyati','Xovos tumani'),
(133,'Sirdaryo viloyati','Guliston shahri'),
(134,'Sirdaryo viloyati','Shirin shahri'),
(135,'Sirdaryo viloyati','Yangiyer shahri'),
(8574,'Sirdaryo viloyati','Baxt shahri'),
(137,'Toshkent shahri','Uchtepa tumani'),
(138,'Toshkent shahri','Bektemir tumani'),
(139,'Toshkent shahri','Yunusobod tumani'),
(140,'Toshkent shahri','Mirzo Ulug’bek tumani'),
(141,'Toshkent shahri','Mirobod tumani'),
(142,'Toshkent shahri','Shayxontohur tumani'),
(143,'Toshkent shahri','Olmazor tumani'),
(144,'Toshkent shahri','Sirg’ali tumani'),
(145,'Toshkent shahri','Yakkasaroy tumani'),
(146,'Toshkent shahri','Yashnobod tumani'),
(147,'Toshkent shahri','Chilonzor tumani'),
(8587,'Toshkent shahri','Yangihayot tumani'),
(148,'Toshkent viloyati','Oqqo’rg’on tumani'),
(149,'Toshkent viloyati','Ohangaron tumani'),
(150,'Toshkent viloyati','Bekobod tumani'),
(151,'Toshkent viloyati','Bo’stonliq tumani'),
(152,'Toshkent viloyati','Bo’ka tumani'),
(154,'Toshkent viloyati','Zangiota tumani'),
(155,'Toshkent viloyati','Yuqorichirchiq tumani'),
(156,'Toshkent viloyati','Qibray tumani'),
(157,'Toshkent viloyati','Parkent tumani'),
(158,'Toshkent viloyati','Piskent tumani'),
(159,'Toshkent viloyati','O’rtachirchiq tumani'),
(160,'Toshkent viloyati','Chinoz tumani'),
(161,'Toshkent viloyati','Yangiyo’l tumani'),
(162,'Toshkent viloyati','Toshkent tumani'),
(163,'Toshkent viloyati','Nurafshon shahri'),
(164,'Toshkent viloyati','Olmaliq shahri'),
(165,'Toshkent viloyati','Angren shahri'),
(166,'Toshkent viloyati','Bekobod shahri'),
(167,'Toshkent viloyati','Ohangaron shahri'),
(168,'Toshkent viloyati','Chirchiq shahri'),
(169,'Toshkent viloyati','Yangiyo’l shahri'),
(5867,'Toshkent viloyati','Quyichirchiq tumani'),
(170,'Farg’ona viloyati','Oltiariq tumani'),
(171,'Farg’ona viloyati','Qo’shtepa tumani'),
(172,'Farg’ona viloyati','Bog’dod tumani'),
(173,'Farg’ona viloyati','Buvayda tumani'),
(174,'Farg’ona viloyati','Beshariq tumani'),
(175,'Farg’ona viloyati','Quva tumani'),
(176,'Farg’ona viloyati','Uchko’prik tumani'),
(177,'Farg’ona viloyati','Rishton tumani'),
(178,'Farg’ona viloyati','So’x tumani'),
(179,'Farg’ona viloyati','Toshloq tumani'),
(180,'Farg’ona viloyati','O’zbekiston tumani'),
(181,'Farg’ona viloyati','Farg’ona tumani'),
(182,'Farg’ona viloyati','Dang’ara tumani'),
(183,'Farg’ona viloyati','Furqat tumani'),
(184,'Farg’ona viloyati','Yozyovon tumani'),
(185,'Farg’ona viloyati','Farg’ona shahri'),
(186,'Farg’ona viloyati','Qo’qon shahri'),
(187,'Farg’ona viloyati','Quvasoy shahri'),
(188,'Farg’ona viloyati','Marg’ilon shahri'),
(189,'Xorazm viloyati','Bog’ot tumani'),
(190,'Xorazm viloyati','Gurlan tumani'),
(191,'Xorazm viloyati','Qo’shko’pir tumani'),
(192,'Xorazm viloyati','Urganch tumani'),
(193,'Xorazm viloyati','Xazorasp tumani'),
(194,'Xorazm viloyati','Xonqa tumani'),
(195,'Xorazm viloyati','Xiva tumani'),
(196,'Xorazm viloyati','Shovot tumani'),
(197,'Xorazm viloyati','Yangiariq tumani'),
(198,'Xorazm viloyati','Yangibozor tumani'),
(199,'Xorazm viloyati','Urganch shahri'),
(200,'Xorazm viloyati','Xiva shahri'),
(8581,'Xorazm viloyati','Tuproqqal’a tumani'),
(201,'Qoraqalpog’iston Respublikasi','Amudaryo tumani'),
(202,'Qoraqalpog’iston Respublikasi','Beruniy tumani'),
(203,'Qoraqalpog’iston Respublikasi','Qorao’zak tumani'),
(204,'Qoraqalpog’iston Respublikasi','Kegeyli tumani'),
(205,'Qoraqalpog’iston Respublikasi','Qo’ng’irot tumani'),
(206,'Qoraqalpog’iston Respublikasi','Qanliko’l tumani'),
(207,'Qoraqalpog’iston Respublikasi','Mo’ynoq tumani'),
(208,'Qoraqalpog’iston Respublikasi','Nukus tumani'),
(209,'Qoraqalpog’iston Respublikasi','Taxiatosh tumani'),
(210,'Qoraqalpog’iston Respublikasi','Taxtako’pir tumani'),
(211,'Qoraqalpog’iston Respublikasi','To’rtko’l tumani'),
(212,'Qoraqalpog’iston Respublikasi','Xo’jayli tumani'),
(213,'Qoraqalpog’iston Respublikasi','Chimboy tumani'),
(214,'Qoraqalpog’iston Respublikasi','Shumanay tumani'),
(215,'Qoraqalpog’iston Respublikasi','Ellikqal’a tumani'),
(216,'Qoraqalpog’iston Respublikasi','Nukus shahri'),
(8575,'Qoraqalpog’iston Respublikasi','Bo‘zatov tumani'),
(111,'Surxondaryo viloyati','Oltinsoy tumani'),
(112,'Surxondaryo viloyati','Angor tumani'),
(113,'Surxondaryo viloyati','Boysun tumani'),
(114,'Surxondaryo viloyati','Muzrabot tumani'),
(115,'Surxondaryo viloyati','Denov tumani'),
(116,'Surxondaryo viloyati','Jarqo’rg’on tumani'),
(117,'Surxondaryo viloyati','Qumqo’rg’on tumani'),
(118,'Surxondaryo viloyati','Qiziriq tumani'),
(119,'Surxondaryo viloyati','Sariosiyo tumani'),
(120,'Surxondaryo viloyati','Termiz tumani'),
(121,'Surxondaryo viloyati','Uzun tumani'),
(122,'Surxondaryo viloyati','Sherobod tumani'),
(123,'Surxondaryo viloyati','Sho’rchi tumani'),
(2981,'Surxondaryo viloyati','Termiz shahri'),
(8580,'Surxondaryo viloyati','Bandixon tumani');
alter table public.store_areas enable row level security;
grant select on public.store_areas to authenticated;
create policy store_area_read on public.store_areas for select to authenticated using (true);
alter table public.stores add column area_id integer references public.store_areas(id);
create index on public.stores(area_id);
create table public.store_offers (
 id uuid primary key default gen_random_uuid(),
 company_id uuid not null references public.companies(id),
 store_id uuid not null references public.stores(id),
 message text not null check(char_length(trim(message)) between 1 and 2000),
 created_at timestamptz not null default now(),
 reply text check(char_length(trim(reply)) between 1 and 2000),
 replied_at timestamptz
);
alter table public.store_offers enable row level security;
revoke all on public.store_offers from public,anon,authenticated;
create index on public.store_offers(company_id,created_at desc);
create index on public.store_offers(store_id,created_at desc);

create function public.save_store_area_profile(p_name text,p_legal_type text,p_legal_name text,p_phone text,
 p_address text,p_latitude numeric,p_longitude numeric,p_area integer) returns void
language plpgsql security definer set search_path='' as $$
begin
 if p_area is null then raise exception 'Hududni tanlang'; end if;
 perform public.update_store_workspace(p_name,p_legal_type,p_legal_name,p_phone,p_address,p_latitude,p_longitude);
 update public.stores set area_id=p_area where owner_id=auth.uid();
end $$;

create function public.offer_store_directory(p_company uuid,p_region text,p_area integer default null)
returns table(id uuid,name text,locality text)
language sql stable security definer set search_path='' as $$
 select s.id,s.name,a.locality from public.stores s join public.store_areas a on a.id=s.area_id
 where public.company_role(p_company) in ('owner','manager') and a.region=p_region
 and (p_area is null or a.id=p_area)
 order by s.name,s.id
$$;

create function public.send_store_offer(p_company uuid,p_store uuid,p_message text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if coalesce(public.company_role(p_company),'') not in ('owner','manager') then
   raise exception 'Ruxsat yo‘q' using errcode='42501';
 end if;
 if not exists(select 1 from public.stores where id=p_store and area_id is not null) then
   raise exception 'Do‘kon topilmadi';
 end if;
 insert into public.store_offers(company_id,store_id,message) values(p_company,p_store,trim(p_message));
end $$;

create function public.list_store_offers(p_company uuid default null)
returns table(id uuid,company_name text,store_name text,message text,created_at timestamptz,reply text,replied_at timestamptz)
language sql stable security definer set search_path='' as $$
 select o.id,c.name,s.name,o.message,o.created_at,o.reply,o.replied_at
 from public.store_offers o join public.stores s on s.id=o.store_id join public.companies c on c.id=o.company_id
 where (p_company is null and s.owner_id=auth.uid() and not public.is_platform_admin())
 or (o.company_id=p_company and public.company_role(p_company) in ('owner','manager'))
 order by o.created_at desc,o.id
$$;

create function public.reply_store_offer(p_offer uuid,p_reply text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if p_reply is null or char_length(trim(p_reply)) not between 1 and 2000 then raise exception 'Javob matnini kiriting'; end if;
 update public.store_offers o set reply=trim(p_reply),replied_at=now()
 where o.id=p_offer and o.reply is null and not public.is_platform_admin()
 and exists(select 1 from public.stores s where s.id=o.store_id and s.owner_id=auth.uid());
 if not found then raise exception 'Taklif topilmadi yoki javob yuborilgan'; end if;
end $$;
revoke execute on function public.save_store_area_profile(text,text,text,text,text,numeric,numeric,integer),
 public.offer_store_directory(uuid,text,integer),public.send_store_offer(uuid,uuid,text),
 public.list_store_offers(uuid),public.reply_store_offer(uuid,text) from public,anon,authenticated;
grant execute on function public.save_store_area_profile(text,text,text,text,text,numeric,numeric,integer),
 public.offer_store_directory(uuid,text,integer),public.send_store_offer(uuid,uuid,text),
 public.list_store_offers(uuid),public.reply_store_offer(uuid,text) to authenticated;
notify pgrst,'reload schema';
commit;
