/**
 * The privacy policy for clients (/{locale}/privacy; docs/launch.md, B6), in
 * RU, ET and EN. Russian is the master: Estonian and English say the same
 * thing, section by section, block by block (tests/privacy-content.test.ts
 * holds them in step).
 *
 * Every line is written from the code, not from guesses: what the database
 * keeps (db/migrations), what the browser keeps (src/app/[locale]), who
 * gets what (docs/accounts.md). Anything not settled yet carries a visible
 * «[to confirm …]» marker; the page shows it highlighted, and Dim and Renat
 * clear each one before the launch.
 *
 * The salon's phone is not written here: the page reads it from «Настройки →
 * Контакты» (locations.phones). There is no salon e-mail in the app yet.
 *
 * No Next.js here: the page and the tests read the same object.
 */
import { COPY, type Locale } from "./i18n";

/** The company responsible for the clients' data: the salon's, not the shop's (Rempire Store OÜ). */
export const CONTROLLER = {
  name: "Rempire OÜ",
  regCode: "11516876",
  street: "Mardi 1",
  postcode: "10145",
  city: "Tallinn",
} as const;

/** The sections, in the page's order. Every language has each of them, and no other. */
export const PRIVACY_SECTIONS = ["who", "data", "device", "why", "share", "abroad", "keep", "rights", "changes"] as const;
export type PrivacySectionId = (typeof PRIVACY_SECTIONS)[number];

/** Who works with the data for us, in the list's order (docs/accounts.md, «Registry»). */
export const PROCESSORS = ["vercel", "railway", "resend", "messaggio", "push", "cloudflare", "osm", "google"] as const;
export type ProcessorId = (typeof PROCESSORS)[number];

/**
 * One piece of a section: a subheading (h3), a paragraph, a bulleted list,
 * or a place where the page draws something of its own: the controller's
 * card (with the salon's live phone) or the list of processors.
 */
export type PrivacyBlock = { h: string } | { p: string } | { list: readonly string[] } | { slot: "controller" | "processors" };

export type PrivacySection = { title: string; blocks: readonly PrivacyBlock[] };

export type PrivacyCopy = {
  metaTitle: string;
  metaDescription: string;
  title: string;
  lead: string;
  /** «Действует с …» */
  since: string;
  /** the contents list's own heading */
  toc: string;
  controller: {
    /** the card's name for a screen reader */
    label: string;
    company: string;
    reg: string;
    address: string;
    phone: string;
    email: string;
    country: string;
    /** shown when the salon has no phone in «Контакты», or the database can't be read */
    phoneTodo: string;
    /** the app has no salon e-mail anywhere yet */
    emailTodo: string;
  };
  processors: Record<ProcessorId, { name: string; what: string; where: string }>;
  sections: Record<PrivacySectionId, PrivacySection>;
};

/** A marker still to clear: «[to confirm]», «[to confirm: …]», «[to confirm with Renat]», «[date of launch]». */
export const PRIVACY_TODO = /\[(?:to confirm|date of launch)[^\]]*\]/g;

const ru: PrivacyCopy = {
  metaTitle: "REMPIRE · Политика конфиденциальности",
  metaDescription: "Как барбершоп REMPIRE хранит и использует данные клиентов, которые записываются на визит.",
  title: "Политика конфиденциальности",
  lead: "Какие данные о вас хранит REMPIRE, когда вы записываетесь на визит, зачем они нужны, кто их видит и какие у вас права.",
  since: "Действует с [date of launch]",
  toc: "Содержание",
  controller: {
    label: "Кто отвечает за данные",
    company: "Компания",
    reg: "Регистрационный код",
    address: "Адрес",
    phone: "Телефон",
    email: "E-mail",
    country: "Эстония",
    phoneTodo: "[to confirm]",
    emailTodo: "[to confirm with Renat]",
  },
  processors: {
    vercel: { name: "Vercel Inc.", what: "Хостинг сайта и приложения.", where: "США; приложение работает в дата-центре во Франкфурте (Германия)" },
    railway: { name: "Railway Corp.", what: "База данных: здесь хранится всё, что описано выше.", where: "США; база данных в Европе (регион EU West) [to confirm: страна]" },
    resend: { name: "Resend, Inc.", what: "Отправляет наши письма.", where: "США [to confirm: регион отправки]" },
    messaggio: { name: "Messaggio", what: "Отправляет наши SMS.", where: "[to confirm: компания и страна]" },
    push: {
      name: "Apple, Google, Mozilla или Microsoft",
      what: "Доставляют уведомления на ваш телефон, только если вы их включили. Какая служба, зависит от вашего браузера. Текст уведомления зашифрован.",
      where: "Зависит от браузера, часто США",
    },
    cloudflare: { name: "Cloudflare, Inc.", what: "DNS: направляет адрес сайта на наш хостинг. Ваших данных не получает. [to confirm: только DNS, без прокси]", where: "США" },
    osm: {
      name: "OpenStreetMap Foundation",
      what: "Карта на странице салона. Ваш браузер загружает её с серверов OpenStreetMap и передаёт им свой IP-адрес и адрес нашего сайта. Карта загружается, только когда вы прокручиваете страницу до неё.",
      where: "Великобритания",
    },
    google: { name: "Google", what: "Только вход сотрудников салона через Google. Данных клиентов не получает.", where: "США" },
  },
  sections: {
    who: {
      title: "Кто отвечает за ваши данные",
      blocks: [
        { p: "За ваши данные отвечает Rempire OÜ, компания барбершопа и тату-студии REMPIRE (по закону — контролёр данных)." },
        { slot: "controller" },
        { p: "Интернет-магазин rempireshop.com принадлежит другой компании, Rempire Store OÜ, и у него своя политика конфиденциальности. Эта страница только о записи в салон." },
      ],
    },
    data: {
      title: "Какие данные мы храним",
      blocks: [
        { h: "Когда вы записываетесь" },
        {
          list: [
            "Имя и телефон",
            "E-mail, если вы его указали",
            "Комментарий для барбера",
            "Барбер, услуги, дата, время и цена визита",
            "Хотите ли вы напоминание по SMS",
            "Язык, на котором вы записались",
          ],
        },
        { p: "Чтобы защититься от спама, мы считаем, сколько записей и переносов приходит с одного IP-адреса. Сам адрес мы не храним, только код, сделанный из него и даты. Код старше двух дней стирается." },
        { h: "Ваши визиты" },
        {
          list: [
            "История визитов и их статусы: пришли, не пришли, отменили, подтвердили",
            "Кто и когда создал, перенёс или отменил запись",
            "Товары, которые вы купили в салоне, если продажа записана на вас",
          ],
        },
        { h: "Что салон может добавить в вашу карточку клиента" },
        {
          list: [
            "Второй телефон, день рождения, пол",
            "Заметки, комментарии, фото и файлы",
            "Категории, класс важности, номер карты, скидку",
            "Какие сообщения вам не присылать и по каким каналам",
            "Отметку, что онлайн-запись для вас закрыта",
          ],
        },
        { p: "[to confirm: хранит ли салон в карточке данные о здоровье, например об аллергии перед татуировкой. Если да, для них нужно ваше отдельное согласие.]" },
        { h: "Сообщения" },
        { p: "Какие письма, SMS и уведомления мы вам отправили: кому, когда, удалось ли отправить и сколько стоило SMS." },
        { h: "Напоминание уведомлением" },
        { p: "Если вы включите напоминание уведомлением на телефоне, мы храним адрес, по которому ваш браузер принимает уведомления, и название устройства, например «iPhone». Это связано только с одним визитом." },
        { h: "Отзывы" },
        { p: "Если вы оставите отзыв: имя, которое вы написали, текст, звёзды, о ком отзыв и дату." },
        { p: "Чтобы защититься от спама, мы считаем, сколько отзывов приходит с одного IP-адреса. Сам адрес мы не храним, только код, сделанный из него и даты. Код старше двух дней стирается, когда приходит следующий отзыв." },
        { h: "Если вы были нашим клиентом раньше" },
        { p: "Отзывы из нашей прежней системы записи перенесены сюда с именем, как оно было написано. Карточки клиентов и визиты тоже будут перенесены. [to confirm: перенос клиентов и визитов ещё не сделан]" },
        { p: "Мы не принимаем оплату на сайте и не храним данные банковских карт." },
      ],
    },
    device: {
      title: "Что хранится на вашем устройстве",
      blocks: [
        { p: "Мы не используем рекламные и аналитические cookies и не следим за вами на других сайтах. Поэтому здесь нет баннера о cookies." },
        { p: "Страница записи запоминает в памяти браузера на этом устройстве (localStorage):" },
        {
          list: [
            "Имя, телефон и e-mail, чтобы в следующий раз заполнить форму за вас",
            "Барбера и услуги последней записи, чтобы выбрать их снова",
            `Ссылку на вашу последнюю запись, её время, барбера и услуги, чтобы показать «${COPY.ru.yourVisit}», пока визит не прошёл`,
            `Что вы нажали «${COPY.ru.install.later}» под советом добавить REMPIRE на экран телефона`,
          ],
        },
        { p: "Эти данные остаются в браузере. Сами по себе они нам не отправляются, только ссылка на визит: по ней страница проверяет, не изменилась ли запись. Чтобы всё стереть, удалите данные этого сайта в настройках браузера." },
        { p: "Язык сайта виден в адресе страницы (/ru, /et, /en) и нигде не сохраняется." },
        { p: "Если вы включите напоминание уведомлением, браузер установит небольшую служебную программу сайта (service worker), которая показывает уведомления." },
        { p: "Cookie для входа есть только в приложении для сотрудников салона." },
      ],
    },
    why: {
      title: "Зачем мы используем данные",
      blocks: [
        { h: "Чтобы записать вас и провести визит" },
        { p: "Принять запись, показать её барберу, дать вам перенести или отменить её и подготовиться к визиту. Основание: договор с вами об услуге (GDPR, ст. 6(1)(b))." },
        { h: "Сообщения о записи" },
        { p: "Подтверждение, напоминание, перенос и отмена — часть услуги (тот же договор). Напоминание по SMS вы выбираете при записи, уведомление на телефоне включаете сами. Если какое-то сообщение вам не нужно, скажите салону, и мы его выключим." },
        { h: "Поздравление и приглашение" },
        { p: "Поздравление с днём рождения и приглашение записаться снова, если вы пропустили визит. Основание: наш законный интерес оставаться на связи с клиентами (ст. 6(1)(f)). Салон может выключить эти сообщения для всех, а для вас — по вашей просьбе." },
        { h: "Новости и предложения" },
        { p: "Иногда салон пишет сразу многим клиентам: новости, предложения. Если вы откажетесь, мы отметим это в карточке, и такие сообщения вам приходить не будут. [to confirm: основание — законный интерес для наших клиентов или отдельное согласие]" },
        { h: "Отзывы" },
        { p: "Отзыв вы оставляете сами, и он появляется на сайте только после проверки салоном. Основание: ваше согласие (ст. 6(1)(a)). Вы можете отозвать его в любой момент, тогда мы уберём отзыв." },
        { h: "Карточка клиента и защита от спама" },
        { p: "Заметки в карточке помогают нам помнить, что вам нравится, и хорошо вас обслуживать. Код против спама защищает онлайн-запись и страницу отзывов. Основание: наш законный интерес (ст. 6(1)(f))." },
        { p: "Мы не продаём ваши данные и не передаём их другим для рекламы." },
      ],
    },
    share: {
      title: "Кто видит ваши данные",
      blocks: [
        { p: "В салоне: владелец и администраторы. Барбер видит свои записи и карточки своих клиентов. У каждого сотрудника свои права доступа." },
        { p: "Барберы работают в салоне как самостоятельные предприниматели. [to confirm: договор с барберами об обработке данных клиентов]" },
        { p: "Когда барбер продаёт вам товар магазина, магазин (Rempire Store OÜ) получает продажу без вашего имени и телефона." },
        { p: "Сервисы, которые работают на нас и получают данные только для этой работы:" },
        { slot: "processors" },
        { p: "Государственным органам мы передаём данные, только если этого требует закон." },
      ],
    },
    abroad: {
      title: "Передача за пределы ЕС",
      blocks: [
        {
          p: "Где можно, мы выбираем серверы в ЕС: приложение работает во Франкфурте, база данных — в Европе. Но Vercel, Railway, Resend и Cloudflare — компании из США, и их сотрудники могут получить доступ к данным из США, например для поддержки. Такая передача разрешена, если компания участвует в EU-US Data Privacy Framework или подписала с нами стандартные договорные условия Еврокомиссии. [to confirm: что именно у каждой компании]",
        },
        { p: "Для Великобритании (OpenStreetMap) Еврокомиссия признала защиту данных достаточной." },
      ],
    },
    keep: {
      title: "Сколько мы храним данные",
      blocks: [
        { p: "Сейчас приложение ничего не удаляет само. Запись никогда не стирается, отменённая тоже: она остаётся в истории визитов." },
        { p: "Сроки хранения:" },
        {
          list: [
            "Карточка клиента и история визитов: пока вы к нам ходите и ещё 3 года после последнего визита, потом мы их удаляем или обезличиваем [to confirm]",
            "Журнал сообщений: 12 месяцев [to confirm]",
            "Отзывы: пока вы не попросите их удалить",
            "Код против спама в отзывах: код старше двух дней стирается, когда приходит следующий отзыв",
            "Подписка на уведомления: пока вы её не выключите или браузер не сообщит, что она больше не работает. После этого мы ей не пользуемся [to confirm: когда удалять]",
            `Память браузера: пока вы её не очистите. «${COPY.ru.yourVisit}» перестаёт показываться, когда визит прошёл или отменён`,
          ],
        },
      ],
    },
    rights: {
      title: "Ваши права",
      blocks: [
        { p: "Вы можете:" },
        {
          list: [
            "Узнать, какие данные о вас у нас есть, и получить их копию",
            "Исправить неверные данные",
            "Попросить удалить данные",
            "Попросить ограничить их использование",
            "Возразить против использования, например против поздравлений и приглашений",
            "Отозвать согласие, например на отзыв; то, что было сделано до этого, остаётся законным",
            "Получить свои данные в обычном файле, чтобы передать их другому",
          ],
        },
        { p: "Как попросить: позвоните или напишите в салон (контакты в начале страницы) или скажите администратору при визите. Мы ответим в течение месяца. Мы можем попросить подтвердить, что это вы, например звонком с номера, с которым вы записывались." },
        { p: "Если у вас есть визиты, мы не стираем их, а обезличиваем: убираем имя и контакты." },
        { p: `Отказаться от напоминания можно прямо при записи («${COPY.ru.remindNone}»). Уведомление выключается кнопкой «${COPY.ru.remind.off}» на странице визита.` },
        { p: "Если вы считаете, что мы нарушаем ваши права, вы можете пожаловаться в Инспекцию по защите данных Эстонии (Andmekaitse Inspektsioon): www.aki.ee. Но лучше сначала напишите нам, мы постараемся всё исправить." },
      ],
    },
    changes: {
      title: "Изменения",
      blocks: [{ p: "Если мы изменим эту политику, новая версия появится на этой странице с новой датой." }],
    },
  },
};

const et: PrivacyCopy = {
  metaTitle: "REMPIRE · Privaatsuspoliitika",
  metaDescription: "Kuidas REMPIRE barbershop hoiab ja kasutab aega broneerivate klientide andmeid.",
  title: "Privaatsuspoliitika",
  lead: "Milliseid andmeid REMPIRE sinu kohta hoiab, kui broneerid aja, milleks neid vaja on, kes neid näeb ja millised on sinu õigused.",
  since: "Kehtib alates [date of launch]",
  toc: "Sisukord",
  controller: {
    label: "Kes vastutab andmete eest",
    company: "Ettevõte",
    reg: "Registrikood",
    address: "Aadress",
    phone: "Telefon",
    email: "E-post",
    country: "Eesti",
    phoneTodo: "[to confirm]",
    emailTodo: "[to confirm with Renat]",
  },
  processors: {
    vercel: { name: "Vercel Inc.", what: "Saidi ja rakenduse majutus.", where: "USA; rakendus töötab Frankfurdi andmekeskuses (Saksamaa)" },
    railway: { name: "Railway Corp.", what: "Andmebaas: siin hoitakse kõike, mis on eespool kirjas.", where: "USA; andmebaas Euroopas (piirkond EU West) [to confirm: riik]" },
    resend: { name: "Resend, Inc.", what: "Saadab meie e-kirjad.", where: "USA [to confirm: saatmise piirkond]" },
    messaggio: { name: "Messaggio", what: "Saadab meie SMS-id.", where: "[to confirm: ettevõte ja riik]" },
    push: {
      name: "Apple, Google, Mozilla või Microsoft",
      what: "Toimetavad teavitused sinu telefoni, ainult kui need sisse lülitasid. Milline teenus, sõltub sinu brauserist. Teavituse tekst on krüpteeritud.",
      where: "Sõltub brauserist, sageli USA",
    },
    cloudflare: { name: "Cloudflare, Inc.", what: "DNS: suunab saidi aadressi meie majutusse. Sinu andmeid ei saa. [to confirm: ainult DNS, ilma proksita]", where: "USA" },
    osm: {
      name: "OpenStreetMap Foundation",
      what: "Kaart salongi lehel. Sinu brauser laadib selle OpenStreetMapi serveritest ja annab neile oma IP-aadressi ja meie saidi aadressi. Kaart laaditakse alles siis, kui kerid lehe selleni.",
      where: "Ühendkuningriik",
    },
    google: { name: "Google", what: "Ainult salongi töötajate sisselogimine Google'iga. Klientide andmeid ei saa.", where: "USA" },
  },
  sections: {
    who: {
      title: "Kes vastutab sinu andmete eest",
      blocks: [
        { p: "Sinu andmete eest vastutab Rempire OÜ, REMPIRE barbershopi ja tätoveerimisstuudio ettevõte (seaduse järgi vastutav töötleja)." },
        { slot: "controller" },
        { p: "E-pood rempireshop.com kuulub teisele ettevõttele, Rempire Store OÜ-le, ja sellel on oma privaatsuspoliitika. See leht räägib ainult salongi aja broneerimisest." },
      ],
    },
    data: {
      title: "Milliseid andmeid me hoiame",
      blocks: [
        { h: "Kui broneerid aja" },
        {
          list: [
            "Nimi ja telefon",
            "E-post, kui selle sisestasid",
            "Kommentaar barberile",
            "Barber, teenused, külastuse kuupäev, kellaaeg ja hind",
            "Kas soovid SMS-meeldetuletust",
            "Keel, milles broneerisid",
          ],
        },
        { p: "Rämpsposti vastu loeme, mitu broneeringut ja ümberbroneerimist tuleb ühelt IP-aadressilt. Aadressi ennast me ei hoia, ainult sellest ja kuupäevast tehtud koodi. Üle kahe päeva vana kood kustutatakse." },
        { h: "Sinu külastused" },
        {
          list: [
            "Külastuste ajalugu ja olekud: tulid, ei tulnud, tühistasid, kinnitasid",
            "Kes ja millal broneeringu tegi, muutis või tühistas",
            "Tooted, mille ostsid salongist, kui müük on märgitud sinu nimele",
          ],
        },
        { h: "Mida salong võib sinu kliendikaardile lisada" },
        {
          list: [
            "Teise telefoni, sünnipäeva, soo",
            "Märkmed, kommentaarid, fotod ja failid",
            "Kategooriad, tähtsusklassi, kaardi numbri, allahindluse",
            "Milliseid sõnumeid sulle mitte saata ja millise kanali kaudu",
            "Märke, et veebibroneering on sinu jaoks suletud",
          ],
        },
        { p: "[to confirm: kas salong hoiab kaardil terviseandmeid, näiteks allergiat enne tätoveeringut. Kui jah, on nende jaoks vaja sinu eraldi nõusolekut.]" },
        { h: "Sõnumid" },
        { p: "Millised e-kirjad, SMS-id ja teavitused me sulle saatsime: kellele, millal, kas saatmine õnnestus ja mis SMS maksis." },
        { h: "Meeldetuletus teavitusena" },
        { p: "Kui lülitad telefonis sisse meeldetuletuse teavitusena, hoiame aadressi, mille kaudu sinu brauser teavitusi vastu võtab, ja seadme nime, näiteks «iPhone». See on seotud ainult ühe külastusega." },
        { h: "Arvustused" },
        { p: "Kui jätad arvustuse: nimi, mille kirjutasid, tekst, tärnid, kelle kohta arvustus on, ja kuupäev." },
        { p: "Rämpsposti vastu loeme, mitu arvustust tuleb ühelt IP-aadressilt. Aadressi ennast me ei hoia, ainult sellest ja kuupäevast tehtud koodi. Üle kahe päeva vana kood kustutatakse, kui tuleb järgmine arvustus." },
        { h: "Kui olid meie klient varem" },
        { p: "Meie eelmise broneerimissüsteemi arvustused on siia üle toodud koos nimega, nagu see oli kirjutatud. Kliendikaardid ja külastused tuuakse samuti üle. [to confirm: klientide ja külastuste ülekanne pole veel tehtud]" },
        { p: "Me ei võta saidil makseid vastu ega hoia pangakaartide andmeid." },
      ],
    },
    device: {
      title: "Mida hoitakse sinu seadmes",
      blocks: [
        { p: "Me ei kasuta reklaami- ega analüütikaküpsiseid ega jälgi sind teistel saitidel. Seepärast pole siin küpsiste bännerit." },
        { p: "Broneerimisleht salvestab selle seadme brauseri mällu (localStorage):" },
        {
          list: [
            "Nime, telefoni ja e-posti, et järgmisel korral vorm sinu eest täita",
            "Viimase broneeringu barberi ja teenused, et need uuesti valida",
            `Lingi sinu viimasele broneeringule, selle aja, barberi ja teenused, et näidata «${COPY.et.yourVisit}», kuni külastus pole möödas`,
            `Et vajutasid «${COPY.et.install.later}» soovituse all lisada REMPIRE telefoni avakuvale`,
          ],
        },
        { p: "Need andmed jäävad brauserisse. Eraldi neid meile ei saadeta, ainult külastuse link: selle järgi kontrollib leht, kas broneering on muutunud. Kõige kustutamiseks kustuta brauseri seadetes selle saidi andmed." },
        { p: "Saidi keel on näha lehe aadressis (/ru, /et, /en) ja seda ei salvestata kuhugi." },
        { p: "Kui lülitad sisse meeldetuletuse teavitusena, paigaldab brauser saidi väikese abiprogrammi (service worker), mis näitab teavitusi." },
        { p: "Sisselogimise küpsis on ainult salongi töötajate rakenduses." },
      ],
    },
    why: {
      title: "Milleks me andmeid kasutame",
      blocks: [
        { h: "Et sind broneerida ja külastus läbi viia" },
        { p: "Broneering vastu võtta, barberile näidata, lasta sul seda muuta või tühistada ja külastuseks valmistuda. Alus: leping sinuga teenuse kohta (GDPR, art 6(1)(b))." },
        { h: "Sõnumid broneeringu kohta" },
        { p: "Kinnitus, meeldetuletus, muutmine ja tühistamine on osa teenusest (sama leping). SMS-meeldetuletuse valid broneerides, teavituse telefonis lülitad ise sisse. Kui mõnda sõnumit pole sul vaja, ütle salongile ja lülitame selle välja." },
        { h: "Õnnitlus ja kutse" },
        { p: "Sünnipäevaõnnitlus ja kutse uuesti broneerima, kui jäid külastusele tulemata. Alus: meie õigustatud huvi hoida klientidega sidet (art 6(1)(f)). Salong võib need sõnumid kõigile välja lülitada, sinu jaoks sinu palvel." },
        { h: "Uudised ja pakkumised" },
        { p: "Mõnikord kirjutab salong korraga paljudele klientidele: uudised, pakkumised. Kui sa neid ei soovi, märgime selle kaardile ja neid sõnumeid sulle ei saadeta. [to confirm: kas alus on õigustatud huvi meie klientide puhul või eraldi nõusolek]" },
        { h: "Arvustused" },
        { p: "Arvustuse jätad ise ja see ilmub saidile alles pärast salongi kontrolli. Alus: sinu nõusolek (art 6(1)(a)). Võid selle igal ajal tagasi võtta, siis eemaldame arvustuse." },
        { h: "Kliendikaart ja kaitse rämpsposti eest" },
        { p: "Märkmed kaardil aitavad meil meeles pidada, mis sulle meeldib, ja sind hästi teenindada. Rämpsposti vastane kood kaitseb veebibroneerimist ja arvustuste lehte. Alus: meie õigustatud huvi (art 6(1)(f))." },
        { p: "Me ei müü sinu andmeid ega anna neid teistele reklaami jaoks." },
      ],
    },
    share: {
      title: "Kes näeb sinu andmeid",
      blocks: [
        { p: "Salongis: omanik ja administraatorid. Barber näeb oma broneeringuid ja oma klientide kaarte. Igal töötajal on oma juurdepääsuõigused." },
        { p: "Barberid töötavad salongis iseseisvate ettevõtjatena. [to confirm: leping barberitega klientide andmete töötlemise kohta]" },
        { p: "Kui barber müüb sulle poe toote, saab pood (Rempire Store OÜ) müügi ilma sinu nime ja telefonita." },
        { p: "Teenused, mis töötavad meie heaks ja saavad andmeid ainult selle töö jaoks:" },
        { slot: "processors" },
        { p: "Riigiasutustele anname andmeid ainult siis, kui seadus seda nõuab." },
      ],
    },
    abroad: {
      title: "Andmete edastamine väljapoole ELi",
      blocks: [
        {
          p: "Võimaluse korral valime serverid ELis: rakendus töötab Frankfurdis, andmebaas Euroopas. Kuid Vercel, Railway, Resend ja Cloudflare on USA ettevõtted ning nende töötajad võivad andmetele ligi pääseda USAst, näiteks toe jaoks. Selline edastamine on lubatud, kui ettevõte osaleb EL-USA andmekaitseraamistikus (Data Privacy Framework) või on sõlminud meiega Euroopa Komisjoni tüüptingimused. [to confirm: mis täpselt iga ettevõtte puhul kehtib]",
        },
        { p: "Ühendkuningriigi (OpenStreetMap) andmekaitse on Euroopa Komisjon tunnistanud piisavaks." },
      ],
    },
    keep: {
      title: "Kui kaua me andmeid hoiame",
      blocks: [
        { p: "Praegu ei kustuta rakendus ise midagi. Broneeringut ei kustutata kunagi, ka tühistatut: see jääb külastuste ajalukku." },
        { p: "Säilitamise ajad:" },
        {
          list: [
            "Kliendikaart ja külastuste ajalugu: kuni käid meil ja veel 3 aastat pärast viimast külastust, siis me need kustutame või muudame isikustamata kujule [to confirm]",
            "Sõnumite logi: 12 kuud [to confirm]",
            "Arvustused: kuni palud need kustutada",
            "Arvustuste rämpsposti vastane kood: üle kahe päeva vana kood kustutatakse, kui tuleb järgmine arvustus",
            "Teavituste tellimus: kuni lülitad selle välja või brauser teatab, et see enam ei tööta. Pärast seda me seda ei kasuta [to confirm: millal kustutada]",
            `Brauseri mälu: kuni selle tühjendad. «${COPY.et.yourVisit}» kaob, kui külastus on möödas või tühistatud`,
          ],
        },
      ],
    },
    rights: {
      title: "Sinu õigused",
      blocks: [
        { p: "Sa võid:" },
        {
          list: [
            "Teada saada, milliseid andmeid me sinu kohta hoiame, ja saada neist koopia",
            "Lasta valed andmed parandada",
            "Paluda andmed kustutada",
            "Paluda nende kasutamist piirata",
            "Esitada vastuväite kasutamisele, näiteks õnnitlustele ja kutsetele",
            "Võtta nõusolek tagasi, näiteks arvustuse puhul; see, mis tehti enne, jääb seaduslikuks",
            "Saada oma andmed tavalise failina, et need kellelegi teisele anda",
          ],
        },
        { p: "Kuidas paluda: helista või kirjuta salongile (kontaktid on lehe alguses) või ütle administraatorile külastuse ajal. Vastame ühe kuu jooksul. Võime paluda kinnitada, et see oled sina, näiteks helistades numbrilt, millega broneerisid." },
        { p: "Kui sul on külastusi, me ei kustuta neid, vaid muudame isikustamata kujule: eemaldame nime ja kontaktid." },
        { p: `Meeldetuletusest saad loobuda kohe broneerides («${COPY.et.remindNone}»). Teavituse lülitad välja külastuse lehel nupuga «${COPY.et.remind.off}».` },
        { p: "Kui leiad, et rikume sinu õigusi, võid pöörduda Andmekaitse Inspektsiooni: www.aki.ee. Aga parem kirjuta enne meile, püüame kõik korda teha." },
      ],
    },
    changes: {
      title: "Muudatused",
      blocks: [{ p: "Kui seda poliitikat muudame, ilmub uus versioon sellele lehele uue kuupäevaga." }],
    },
  },
};

const en: PrivacyCopy = {
  metaTitle: "REMPIRE · Privacy policy",
  metaDescription: "How REMPIRE barbershop keeps and uses the details of clients who book a visit.",
  title: "Privacy policy",
  lead: "What REMPIRE keeps about you when you book a visit, why it is needed, who sees it, and what your rights are.",
  since: "In force from [date of launch]",
  toc: "Contents",
  controller: {
    label: "Who is responsible for the data",
    company: "Company",
    reg: "Registry code",
    address: "Address",
    phone: "Phone",
    email: "E-mail",
    country: "Estonia",
    phoneTodo: "[to confirm]",
    emailTodo: "[to confirm with Renat]",
  },
  processors: {
    vercel: { name: "Vercel Inc.", what: "Hosts the site and the app.", where: "USA; the app runs in the Frankfurt data centre (Germany)" },
    railway: { name: "Railway Corp.", what: "The database: everything described above is kept here.", where: "USA; the database in Europe (region EU West) [to confirm: country]" },
    resend: { name: "Resend, Inc.", what: "Sends our e-mails.", where: "USA [to confirm: sending region]" },
    messaggio: { name: "Messaggio", what: "Sends our SMS.", where: "[to confirm: company and country]" },
    push: {
      name: "Apple, Google, Mozilla or Microsoft",
      what: "Deliver notifications to your phone, only if you turned them on. Which one depends on your browser. The notification's text is encrypted.",
      where: "Depends on the browser, often the USA",
    },
    cloudflare: { name: "Cloudflare, Inc.", what: "DNS: points the site's address to our hosting. It gets none of your data. [to confirm: DNS only, no proxy]", where: "USA" },
    osm: {
      name: "OpenStreetMap Foundation",
      what: "The map on the salon's page. Your browser loads it from OpenStreetMap's servers and gives them its IP address and our site's address. The map loads only when you scroll down to it.",
      where: "United Kingdom",
    },
    google: { name: "Google", what: "Only the salon staff's sign-in with Google. It gets no client data.", where: "USA" },
  },
  sections: {
    who: {
      title: "Who is responsible for your data",
      blocks: [
        { p: "Rempire OÜ, the company of REMPIRE barbershop and tattoo studio, is responsible for your data (by law, the data controller)." },
        { slot: "controller" },
        { p: "The online shop rempireshop.com belongs to another company, Rempire Store OÜ, and has its own privacy policy. This page is only about booking at the salon." },
      ],
    },
    data: {
      title: "What we keep",
      blocks: [
        { h: "When you book" },
        {
          list: [
            "Your name and phone",
            "Your e-mail, if you gave it",
            "Your comment for the barber",
            "The barber, services, date, time and price of the visit",
            "Whether you want an SMS reminder",
            "The language you booked in",
          ],
        },
        { p: "To stop spam, we count how many bookings and moves come from one IP address. We do not keep the address itself, only a code made from it and the date. A code older than two days is erased." },
        { h: "Your visits" },
        {
          list: [
            "Your visit history and each visit's status: came, did not come, cancelled, confirmed",
            "Who made, moved or cancelled a booking, and when",
            "Products you bought at the salon, if the sale is put on your name",
          ],
        },
        { h: "What the salon may add to your client card" },
        {
          list: [
            "A second phone, your birthday, gender",
            "Notes, comments, photos and files",
            "Categories, an importance class, a card number, a discount",
            "Which messages not to send you, and by which channels",
            "A mark that online booking is closed for you",
          ],
        },
        { p: "[to confirm: whether the salon keeps health data on the card, for example an allergy before a tattoo. If so, that needs your separate consent.]" },
        { h: "Messages" },
        { p: "Which e-mails, SMS and notifications we sent you: to whom, when, whether they went out, and what an SMS cost." },
        { h: "A reminder as a notification" },
        { p: "If you turn on the reminder as a notification on your phone, we keep the address your browser receives notifications at and the device's name, for example «iPhone». It belongs to one visit only." },
        { h: "Reviews" },
        { p: "If you leave a review: the name you wrote, the text, the stars, who it is about and the date." },
        { p: "To stop spam, we count how many reviews come from one IP address. We do not keep the address itself, only a code made from it and the date. A code older than two days is erased when the next review comes in." },
        { h: "If you were our client before" },
        { p: "Reviews from our previous booking system were moved here with the name as it was written. Client cards and visits will be moved too. [to confirm: the move of clients and visits is not done yet]" },
        { p: "We take no payments on the site and keep no bank card details." },
      ],
    },
    device: {
      title: "What is kept on your device",
      blocks: [
        { p: "We use no advertising or analytics cookies and do not follow you on other sites. That is why there is no cookie banner here." },
        { p: "The booking page keeps in this device's browser storage (localStorage):" },
        {
          list: [
            "Your name, phone and e-mail, to fill in the form for you next time",
            "The barber and services of your last booking, to pick them again",
            `The link to your latest booking, its time, barber and services, to show «${COPY.en.yourVisit}» until the visit is over`,
            `That you tapped «${COPY.en.install.later}» under the tip to add REMPIRE to your home screen`,
          ],
        },
        { p: "This stays in your browser. It is not sent to us on its own, only the visit link: with it the page checks whether the booking has changed. To erase it all, clear this site's data in your browser's settings." },
        { p: "The site's language is in the page address (/ru, /et, /en) and is not stored anywhere." },
        { p: "If you turn on the reminder as a notification, your browser installs a small helper program of the site (a service worker) that shows the notifications." },
        { p: "A login cookie exists only in the salon staff's app." },
      ],
    },
    why: {
      title: "Why we use your data",
      blocks: [
        { h: "To book you and run the visit" },
        { p: "To take the booking, show it to the barber, let you move or cancel it, and get ready for the visit. Legal basis: our contract with you for the service (GDPR, Article 6(1)(b))." },
        { h: "Messages about your booking" },
        { p: "The confirmation, the reminder, the move and the cancellation messages are part of the service (the same contract). You choose the SMS reminder when you book, and you turn on the phone notification yourself. If you do not want a message, tell the salon and we will switch it off." },
        { h: "Greetings and invitations" },
        { p: "A birthday greeting, and an invitation to book again if you missed a visit. Legal basis: our legitimate interest in keeping in touch with clients (Article 6(1)(f)). The salon can switch these off for everyone, and for you if you ask." },
        { h: "News and offers" },
        { p: "Sometimes the salon writes to many clients at once: news, offers. If you say no, we mark it on your card and these messages stop. [to confirm: whether the basis is our legitimate interest for existing clients or separate consent]" },
        { h: "Reviews" },
        { p: "You choose to leave a review, and it shows on the site only after the salon has checked it. Legal basis: your consent (Article 6(1)(a)). You can withdraw it at any time; then we take the review down." },
        { h: "Your client card and spam protection" },
        { p: "Notes on your card help us remember what you like and serve you well. The spam code protects the online booking and the reviews page. Legal basis: our legitimate interest (Article 6(1)(f))." },
        { p: "We do not sell your data or give it to others for advertising." },
      ],
    },
    share: {
      title: "Who sees your data",
      blocks: [
        { p: "At the salon: the owner and the front desk. A barber sees his own bookings and the cards of his own clients. Each member of staff has their own access rights." },
        { p: "The barbers work at the salon as independent entrepreneurs. [to confirm: an agreement with the barbers on processing clients' data]" },
        { p: "When a barber sells you a product of the shop, the shop (Rempire Store OÜ) gets the sale without your name or phone." },
        { p: "Services that work for us and get data only for that work:" },
        { slot: "processors" },
        { p: "We give data to public authorities only when the law requires it." },
      ],
    },
    abroad: {
      title: "Transfers outside the EU",
      blocks: [
        {
          p: "Where we can, we pick servers in the EU: the app runs in Frankfurt and the database in Europe. But Vercel, Railway, Resend and Cloudflare are US companies, and their staff may reach the data from the USA, for example for support. That is allowed when the company takes part in the EU-US Data Privacy Framework or has signed the European Commission's standard contractual clauses with us. [to confirm: which applies to each company]",
        },
        { p: "For the United Kingdom (OpenStreetMap), the European Commission has found its data protection adequate." },
      ],
    },
    keep: {
      title: "How long we keep data",
      blocks: [
        { p: "Today the app deletes nothing by itself. A booking is never erased, a cancelled one included: it stays in the visit history." },
        { p: "How long we keep things:" },
        {
          list: [
            "Your client card and visit history: while you keep coming, and 3 years after your last visit; then we delete or anonymise them [to confirm]",
            "The message log: 12 months [to confirm]",
            "Reviews: until you ask us to delete them",
            "The spam code of a review: a code older than two days is erased when the next review comes in",
            "A notification subscription: until you turn it off or the browser says it no longer works. After that we no longer use it [to confirm: when to delete it]",
            `The browser storage: until you clear it. «${COPY.en.yourVisit}» stops showing once the visit is over or cancelled`,
          ],
        },
      ],
    },
    rights: {
      title: "Your rights",
      blocks: [
        { p: "You can:" },
        {
          list: [
            "Find out what data we hold about you and get a copy",
            "Have wrong details corrected",
            "Ask us to delete your data",
            "Ask us to limit how we use it",
            "Object to a use, for example to the greetings and invitations",
            "Withdraw your consent, for example to a review; what was done before stays lawful",
            "Get your data in a common file, to give to someone else",
          ],
        },
        { p: "How to ask: call or write to the salon (the contacts are at the top of this page), or tell the front desk at your visit. We answer within one month. We may ask you to show it is you, for example by calling from the number you booked with." },
        { p: "If you have visits, we do not erase them but anonymise them: we remove your name and contacts." },
        { p: `You can say no to the reminder when you book («${COPY.en.remindNone}»). The notification turns off with «${COPY.en.remind.off}» on the visit page.` },
        { p: "If you think we are breaking your rights, you can complain to the Estonian Data Protection Inspectorate (Andmekaitse Inspektsioon): www.aki.ee. But please write to us first; we will try to put it right." },
      ],
    },
    changes: {
      title: "Changes",
      blocks: [{ p: "If we change this policy, the new version appears on this page with a new date." }],
    },
  },
};

export const PRIVACY: Record<Locale, PrivacyCopy> = { ru, et, en };

/** The controller's address on one line, the country in the page's language. */
export function controllerAddress(locale: Locale): string {
  return `${CONTROLLER.street}, ${CONTROLLER.postcode} ${CONTROLLER.city}, ${PRIVACY[locale].controller.country}`;
}
