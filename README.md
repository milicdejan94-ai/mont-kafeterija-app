# Mont Kafeterija Lager App

Prva verzija interne aplikacije za Mont kafeteriju.

## Funkcije

- Login preko Supabase Auth
- Admin panel
- Šanker panel
- Artikli/pića sa izmjenom naziva, kategorije, pakovanja/doze, nabavne cijene, prodajne cijene i PDV-a
- Lager šanka
- Lager magacina
- Prijem robe na šank ili u magacin
- Potrošnja šanka po smjeni
- Potrošnja iz magacina za privatne proslave
- Zaključavanje dokumenta potrošnje nakon submit-a
- Šanker nakon submit-a više ne vidi dokument
- Finansijski pregledi: prodajna vrijednost, nabavna vrijednost, razlika
- Kafa: `KAFA ESPRESSO` ima pravilo `1 kg = 125 kafa`

## Instalacija lokalno

1. Otvori folder u Visual Studio Code.
2. Instaliraj pakete:

```bash
npm install
```

3. Napravi `.env.local` fajl po uzoru na `.env.example`:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=xxxxx
```

4. U Supabase SQL Editor prvo pokreni:

```sql
supabase/schema.sql
```

5. Zatim pokreni početnu listu pića:

```sql
supabase/seed_products.sql
```

6. U Supabase Authentication kreiraj korisnike:

- admin email
- šanker 1 email
- šanker 2 email

7. Nakon što ih kreiraš, iz Authentication kopiraj njihove User ID vrijednosti i ubaci profile u SQL Editor:

```sql
insert into profiles(id, full_name, role, active) values
('OVDJE_ADMIN_USER_ID', 'Dejan Admin', 'admin', true),
('OVDJE_SANKER_1_USER_ID', 'Šanker 1', 'bartender', true),
('OVDJE_SANKER_2_USER_ID', 'Šanker 2', 'bartender', true);
```

8. Pokreni aplikaciju:

```bash
npm run dev
```

9. Otvori:

```bash
http://localhost:3000
```

## Napomena za kafu

Za `KAFA ESPRESSO` stanje se vodi u kilogramima. Kada šanker unese npr. 40 kafa, aplikacija skida:

```text
40 / 125 = 0.32 kg
```

Nabavna cijena za espresso kafu treba da bude cijena po 1 kg, a prodajna cijena cijena jedne kafe.

## Napomena za žestoka pića

Za pića `0.03` prva verzija vodi jednu dozu kao jednu jedinicu potrošnje. Kasnije možemo dodati praćenje po flaši, npr. 1L = oko 33 doze.

## Deploy na Vercel

Kada lokalno proradi:

1. Pošalji projekat na GitHub.
2. Importuj projekat u Vercel.
3. Dodaj iste env varijable iz `.env.local` u Vercel Project Settings.
4. Deploy.
