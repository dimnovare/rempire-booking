-- 029_commission_gross_list.sql: what the barber's 17 % is counted on.
-- Renat answered question 1 on 18.11.2026: from the price with VAT, and
-- from the regular price even when the product had a discount («17 % при
-- продаже от конечной цены с НДС»). That is the basis «gross-list»
-- (src/lib/money.ts). Until then the setting started as Dim's pick,
-- «net-paid»; a business still on that pick moves to Renat's answer.
--
-- A sale already made keeps the basis it was made with (product_sales).
-- Never edit this file once it has run anywhere; add a new one.

update businesses
   set settings = settings || '{"commission_basis": "gross-list"}'::jsonb
 where coalesce(settings ->> 'commission_basis', 'net-paid') = 'net-paid';
