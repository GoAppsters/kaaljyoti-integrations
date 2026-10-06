/**
 * Widget chrome in English and Hindi.
 *
 * Design decision 10 splits the problem in two, and this file is only the
 * first half:
 *
 *   * **Chrome** — labels, error lines, form fields — is bundled here,
 *     because it is ours and it must be there before the first response is.
 *   * **Entity names** — a nakshatra, a sign, a graha — come from the
 *     response, which carries `names.en` and `names.hi` for every id when the
 *     request asks for both languages. {@link pick} is the one accessor.
 *
 * The panchang's own names — `tithi_name`, `yoga_name`, `karana_name`,
 * `paksha`, `vara` and `masa.month_name` — arrive the same way: the gateway
 * labels each from its index as `{id, name, names}`, with the engine's English
 * as the `id`. {@link nameOf} reads any of them. The one thing the response
 * does not spell out is a leap month: `month_name` names the month and
 * `is_adhik` says it is the extra one, so {@link masaName} adds the prefix.
 */

/** The two languages 0.1.0 speaks. */
export type Lang = 'en' | 'hi';

/** English chrome; its keys are the message keys for both languages. */
const EN = {
  // Panchang and muhurta labels.
  tithi: 'Tithi',
  nakshatra: 'Nakshatra',
  yoga: 'Yoga',
  moonsign: 'Moon sign',
  lagna: 'Lagna',
  // The prefix of an intercalary month: `Adhik Shravana`. @see masaName
  adhik: 'Adhik',

  // Joining words for a limb that ends during the day: `Ekadashi until 21:44,
  // then Dwadashi`. Hindi puts `तक` after the clock — see `untilText`.
  until: 'until',

  // States.
  loading: 'Loading…',
  powered_by: 'Powered by Kaal Jyoti',

  // Error lines, keyed by the code the client throws or the API returns.
  no_key: 'No Kaal Jyoti key on this page.',
  secret_key: 'This page has a secret Kaal Jyoti key. Use a publishable key (kj_pub_…) instead.',
  no_place: 'No place: set a city, or lat and lon.',
  no_birth: 'No birth: set datetime, and lat and lon or a city.',
  forbidden_origin: 'This key does not allow {origin}. Add that origin to the key.',
  rate_limited: 'Too many requests just now. Try again in a moment.',
  quota_exceeded: 'This key has used up its credits for the month.',
  plan_required: 'This plan does not include this request.',
  invalid_key: 'The key on this page is missing, wrong or revoked.',
  network_error: 'Could not reach Kaal Jyoti.',
  origin_hint: 'Is {origin} on the key?',
  generic_error: 'Something went wrong.',

  // Birth form.
  name: 'Name',
  date_of_birth: 'Date of birth',
  time_of_birth: 'Time of birth',
  place: 'Place',
  city: 'City',
  other_place: 'Other place',
  // The search under "Other place": Google Places with a site's Maps key,
  // else Photon (OpenStreetMap), else `/v1/places`. One line serves no match
  // and a failed search, since the answer to both is the coordinates below it.
  search_place: 'Search for the place',
  no_places: 'No place found. Enter its latitude and longitude.',
  // The credit OpenStreetMap's licence asks for under Photon's results.
  osm_credit: '© OpenStreetMap contributors',
  latitude: 'Latitude',
  longitude: 'Longitude',
  submit: 'Show kundli',

  // Kundli summary and chart.
  yogas: 'Yogas',
  planets: 'Planets',
  planet: 'Planet',
  sign: 'Sign',
  degrees: 'Degrees',
  house: 'House',
  pada: 'Pada',
  retrograde: 'Retrograde',
  ascendant: 'Ascendant',

  // Match form (Ashtakoot guna milan).
  note: 'Note',
  yes: 'Yes',
  no: 'No',
  // Horoscope and readings. The pickers, and the period and day tabs.
  choose_sign: 'Choose your sign',
  choose_nakshatra: 'Choose your nakshatra',
  // `<kj-reading type="house_lords">`: one heading per house, e.g.
  // `1st house · Gemini · lord Mercury in the 9th`.
  house_lords: 'House lords',
  house_lord_heading: '{house} house · {sign} · lord {lord} in the {in}',
  today: 'Today',
  from: 'from',
  // `show-basis`: the transits a horoscope was read from, folded away.
  basis: 'Transits behind this',
  favourable: 'favourable',
  // The three tones of a summary, as a badge. @see levelHtml
  level_favourable: 'Favourable',
  level_mixed: 'Mixed',
  level_care: 'Needs care',
  // Life areas: the horoscope's five, the varshphal's seven, and the eleven of
  // the life-areas reading, in the engine's own words.
  area_work: 'Work',
  area_money: 'Money',
  area_relationships: 'Relationships',
  area_health: 'Health',
  area_education: 'Education',
  area_home: 'Home and property',
  area_travel: 'Travel',
  area_self: 'Personality',
  area_wealth: 'Wealth',
  area_siblings: 'Courage and siblings',
  area_children: 'Children and creativity',
  area_marriage: 'Marriage and partnership',
  area_fortune: 'Fortune',
  area_career: 'Career',
  area_foreign: 'Foreign lands and spending',
  grahas: 'Grahas',
  // `Sun · Aries · 10th house`
  graha_heading: '{graha} · {sign} · {house} house',
  no_yogas: 'No yogas of this list form in this chart.',
  vimshottari: 'Vimshottari dasha',
  mahadasha: '{lord} mahadasha',
  current: 'Running now',
  varshphal: 'Varshphal {year}',
  months: 'Periods of the year',
  life_areas: 'Life areas',

  // The design system (revamp): states, titles, the new form and the report.
  nothing_here: 'Nothing to show yet.',
  plan_title: 'Available on the {plan} plan',
  plan_title_generic: 'Not included in this plan',
  plan_body: 'This section is part of the {plan} plan and is not switched on for this site yet.',
  plan_body_generic: 'This section is not switched on for this site yet.',
  plan_browser: 'This section cannot be shown in a web widget.',
  plan_title_paid: 'Available on a paid plan',
  plan_body_paid:
    'This section is part of every paid plan and is not switched on for this site yet.',
  plan_owner: 'Site owner: upgrade at',
  quota_owner: 'Site owner: add credits or upgrade at',
  quota_title: 'Monthly limit reached',
  title_chart: 'Birth chart',
  title_kundli: 'Janam kundli',
  title_reading: 'Reading',
  form_intro: 'Enter the birth details',
  optional: 'optional',
  gender: 'Gender',
  gender_male: 'Male',
  gender_female: 'Female',
  day: 'Day',
  month: 'Month',
  year: 'Year',
  hour: 'Hour',
  minute: 'Minute',
  am: 'AM',
  pm: 'PM',
  birth_place: 'Place of birth',
  place_hint: 'Start typing a town, city or village',
  edit_coords: 'Edit coordinates',
  timezone: 'Timezone',
  tz_derived: 'worked out from the coordinates',
  err_date: 'Choose a valid date of birth.',
  err_time: 'Choose the time of birth.',
  err_place: 'Search for the place of birth and pick it from the list, or enter its coordinates.',
  clear_form: 'Clear',
  remembered: 'Your last entry on this device is filled in.',
  tab_overview: 'Overview',
  tab_charts: 'Charts',
  tab_planets: 'Planets',
  tab_dasha: 'Dasha',
  tab_life: 'Life areas',
  tab_readings: 'Readings',
  report_tabs: 'Kundli report',
  mahadasha_label: 'Mahadasha',
  antardasha: 'Antardasha',
  current_dasha: 'Running dasha',
  dasha_timeline: 'Vimshottari mahadashas',
  antardashas_of: 'Antardashas of {lord}',
  key_yogas: 'Yogas in the chart',
  about_lagna: 'Your lagna',
  chart_d1: 'Lagna (D1)',
  chart_d9: 'Navamsa (D9)',
  chart_moon: 'Moon chart',
  chart_chalit: 'Chalit',
  chart_which: 'Chart',
  chart_style: 'Chart style',
  style_north: 'North',
  style_south: 'South',
  style_circular: 'Circular',
  bhava: 'Bhava',
  madhya: 'Bhava madhya',
  chalit_note:
    'Bhava chalit (Sripati): the sign and degree at the middle of each house, and the grahas in it.',
  dignity: 'Dignity',
  vargottama: 'Vargottama',
  ends: 'Ends',
  starts: 'Starts',
  good_time: 'Auspicious',
  bad_time: 'Avoid',
  now: 'Now',
  next_sunrise: 'Next sunrise',
  night_part: 'Night',
  // Stage 2: the collapsed form, and the proxy state (decision 23).
  edit_details: 'Edit details',
  proxy_title: 'Needs a server connection',
  proxy_body: 'This widget needs the Kaal Jyoti WordPress plugin or a server proxy on this site.',
  proxy_owner: 'Site owner:',
  proxy_docs: 'see the setup guide',
} as const;

/** Every label a widget can ask for. */
export type MessageKey = keyof typeof EN;

const HI: Record<MessageKey, string> = {
  tithi: 'तिथि',
  nakshatra: 'नक्षत्र',
  yoga: 'योग',
  moonsign: 'चंद्र राशि',
  lagna: 'लग्न',
  adhik: 'अधिक',

  until: 'तक',

  loading: 'लोड हो रहा है…',
  powered_by: 'काल ज्योति द्वारा',

  no_key: 'इस पृष्ठ पर काल ज्योति कुंजी नहीं है।',
  secret_key:
    'इस पृष्ठ पर काल ज्योति की गुप्त कुंजी है। उसकी जगह प्रकाशनीय कुंजी (kj_pub_…) लगाएँ।',
  no_place: 'स्थान नहीं: city, या lat और lon दें।',
  no_birth: 'जन्म विवरण नहीं: datetime, तथा lat और lon या city दें।',
  forbidden_origin: 'यह कुंजी {origin} की अनुमति नहीं देती। उस origin को कुंजी में जोड़ें।',
  rate_limited: 'अभी बहुत अधिक अनुरोध। कुछ क्षण बाद प्रयास करें।',
  quota_exceeded: 'इस कुंजी के इस माह के क्रेडिट समाप्त हो गए हैं।',
  plan_required: 'इस योजना में यह अनुरोध शामिल नहीं है।',
  invalid_key: 'इस पृष्ठ की कुंजी अनुपस्थित, गलत या निरस्त है।',
  network_error: 'काल ज्योति तक नहीं पहुँच सके।',
  origin_hint: 'क्या {origin} कुंजी में है?',
  generic_error: 'कुछ गड़बड़ हो गई।',

  name: 'नाम',
  date_of_birth: 'जन्म तिथि',
  time_of_birth: 'जन्म समय',
  place: 'स्थान',
  city: 'शहर',
  other_place: 'अन्य स्थान',
  search_place: 'स्थान खोजें',
  no_places: 'कोई स्थान नहीं मिला। अक्षांश और देशांतर भरें।',
  osm_credit: '© OpenStreetMap योगदानकर्ता',
  latitude: 'अक्षांश',
  longitude: 'देशांतर',
  submit: 'कुंडली देखें',

  yogas: 'योग',
  planets: 'ग्रह',
  planet: 'ग्रह',
  sign: 'राशि',
  degrees: 'अंश',
  house: 'भाव',
  pada: 'पाद',
  retrograde: 'वक्री',
  ascendant: 'लग्न',

  note: 'टिप्पणी',
  yes: 'हाँ',
  no: 'नहीं',
  choose_sign: 'अपनी राशि चुनें',
  choose_nakshatra: 'अपना नक्षत्र चुनें',
  house_lords: 'भावेश',
  house_lord_heading: '{house} भाव · {sign} · भावेश {lord} {in} भाव में',
  today: 'आज',
  from: 'से',
  basis: 'इसके आधार गोचर',
  favourable: 'शुभ',
  level_favourable: 'अनुकूल',
  level_mixed: 'मिश्रित',
  level_care: 'सावधानी',
  area_work: 'कार्य',
  area_money: 'धन',
  area_relationships: 'संबंध',
  area_health: 'स्वास्थ्य',
  area_education: 'शिक्षा',
  area_home: 'गृह और संपत्ति',
  area_travel: 'यात्रा',
  area_self: 'व्यक्तित्व',
  area_wealth: 'धन',
  area_siblings: 'पराक्रम और भाई-बहन',
  area_children: 'संतान और सृजनशीलता',
  area_marriage: 'विवाह और साझेदारी',
  area_fortune: 'भाग्य',
  area_career: 'कार्यक्षेत्र',
  area_foreign: 'विदेश और व्यय',
  grahas: 'ग्रह',
  graha_heading: '{graha} · {sign} · {house} भाव',
  no_yogas: 'इस सूची का कोई योग इस कुंडली में नहीं बनता।',
  vimshottari: 'विंशोत्तरी दशा',
  mahadasha: '{lord} महादशा',
  current: 'वर्तमान',
  varshphal: 'वर्षफल {year}',
  months: 'वर्ष की अवधियाँ',
  life_areas: 'जीवन के क्षेत्र',

  nothing_here: 'अभी दिखाने को कुछ नहीं है।',
  plan_title: '{plan} योजना पर उपलब्ध',
  plan_title_generic: 'इस योजना में शामिल नहीं',
  plan_body: 'यह भाग {plan} योजना का हिस्सा है और इस साइट पर अभी चालू नहीं है।',
  plan_body_generic: 'यह भाग इस साइट पर अभी चालू नहीं है।',
  plan_browser: 'यह भाग वेब विजेट में नहीं दिखाया जा सकता।',
  plan_title_paid: 'सशुल्क योजना पर उपलब्ध',
  plan_body_paid: 'यह भाग हर सशुल्क योजना का हिस्सा है और इस साइट पर अभी चालू नहीं है।',
  plan_owner: 'साइट स्वामी: अपग्रेड करें —',
  quota_owner: 'साइट स्वामी: क्रेडिट जोड़ें या अपग्रेड करें —',
  quota_title: 'मासिक सीमा पूरी',
  title_chart: 'जन्म कुंडली',
  title_kundli: 'जन्म कुंडली',
  title_reading: 'फलादेश',
  form_intro: 'जन्म विवरण भरें',
  optional: 'वैकल्पिक',
  gender: 'लिंग',
  gender_male: 'पुरुष',
  gender_female: 'स्त्री',
  day: 'दिन',
  month: 'माह',
  year: 'वर्ष',
  hour: 'घंटा',
  minute: 'मिनट',
  am: 'पूर्वाह्न',
  pm: 'अपराह्न',
  birth_place: 'जन्म स्थान',
  place_hint: 'शहर, कस्बे या गाँव का नाम लिखें',
  edit_coords: 'निर्देशांक बदलें',
  timezone: 'समय क्षेत्र',
  tz_derived: 'निर्देशांक से निकाला जाएगा',
  err_date: 'सही जन्म तिथि चुनें।',
  err_time: 'जन्म का समय चुनें।',
  err_place: 'जन्म स्थान खोजकर सूची से चुनें, या उसके निर्देशांक भरें।',
  clear_form: 'साफ़ करें',
  remembered: 'इस डिवाइस पर आपका पिछला विवरण भरा हुआ है।',
  tab_overview: 'सारांश',
  tab_charts: 'चार्ट',
  tab_planets: 'ग्रह',
  tab_dasha: 'दशा',
  tab_life: 'जीवन क्षेत्र',
  tab_readings: 'फलादेश',
  report_tabs: 'कुंडली रिपोर्ट',
  mahadasha_label: 'महादशा',
  antardasha: 'अंतर्दशा',
  current_dasha: 'वर्तमान दशा',
  dasha_timeline: 'विंशोत्तरी महादशाएँ',
  antardashas_of: '{lord} की अंतर्दशाएँ',
  key_yogas: 'कुंडली के योग',
  about_lagna: 'आपका लग्न',
  chart_d1: 'लग्न (D1)',
  chart_d9: 'नवांश (D9)',
  chart_moon: 'चंद्र कुंडली',
  chart_chalit: 'चलित',
  chart_which: 'चार्ट',
  chart_style: 'चार्ट शैली',
  style_north: 'उत्तर',
  style_south: 'दक्षिण',
  style_circular: 'वृत्ताकार',
  bhava: 'भाव',
  madhya: 'भाव मध्य',
  chalit_note: 'भाव चलित (श्रीपति): प्रत्येक भाव के मध्य की राशि और अंश, और उसमें स्थित ग्रह।',
  dignity: 'स्थिति',
  vargottama: 'वर्गोत्तम',
  ends: 'समाप्ति',
  starts: 'आरंभ',
  good_time: 'शुभ',
  bad_time: 'अशुभ',
  now: 'अभी',
  next_sunrise: 'अगला सूर्योदय',
  night_part: 'रात',
  edit_details: 'विवरण बदलें',
  proxy_title: 'सर्वर कनेक्शन चाहिए',
  proxy_body: 'इस विजेट के लिए इस साइट पर काल ज्योति वर्डप्रेस प्लगइन या सर्वर प्रॉक्सी चाहिए।',
  proxy_owner: 'साइट स्वामी:',
  proxy_docs: 'सेटअप गाइड देखें',
};

/**
 * A chrome label, with `{name}` placeholders filled in.
 *
 * `forbidden_origin` says which origin to add, because it is the one error a
 * site owner can actually fix, and `origin_hint` names it after `network_error`; `in_house` takes a number, `varshphal` a year,
 * and `house_lord_heading` two ordinals and two names.
 */
export function t(lang: Lang, key: MessageKey, vars?: Record<string, string>): string {
  const text = lang === 'hi' ? HI[key] : EN[key];
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (whole, name: string) => vars[name] ?? whole);
}

/**
 * The name for this language out of a response's `names` object.
 *
 * `fallback` is the response's own `name` field, which is always English and
 * always present; a Hindi translation the engine has not got yet must not
 * render as `undefined`.
 */
export function pick(
  names: { en?: string; hi?: string } | undefined,
  fallback: string,
  lang: Lang,
): string {
  return names?.[lang] ?? fallback;
}

/** A name the gateway labelled: `{id, name, names}`. */
export interface Labelled {
  id: string;
  name: string;
  names?: { en?: string; hi?: string };
}

/**
 * A labelled name in `lang` — a nakshatra, a tithi, a vara — or `''` when
 * the response has none. The same {@link pick} every entity name goes through.
 */
export function nameOf(value: Labelled | null | undefined, lang: Lang): string {
  if (!value) return '';
  return pick(value.names, value.name, lang);
}

/**
 * A lunar month, including a leap one: `Adhik Shravana` / `अधिक श्रावण`.
 *
 * The label is the month's own name; `is_adhik` is a separate flag on the
 * masa, so the prefix is ours to add, in the chrome's words.
 */
export function masaName(
  month: Labelled | null | undefined,
  isAdhik: boolean | null | undefined,
  lang: Lang,
): string {
  const name = nameOf(month, lang);
  if (!name) return '';
  return isAdhik ? `${t(lang, 'adhik')} ${name}` : name;
}
