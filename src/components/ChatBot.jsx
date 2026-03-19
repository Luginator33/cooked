import { useState, useRef, useEffect } from "react"

// ============================================================
// COOKED KNOWLEDGE BASE — embedded for chatbot system prompt
// ============================================================
const RESTAURANT_KB = `# COOKED — Restaurant Knowledge Base
> Chatbot system reference. Deep intel on all 686 restaurants across 22 cities.
> Use this to give advice that sounds like a well-traveled friend who's actually eaten everywhere.

---

## HOW TO USE THIS
When someone asks for advice, you're not a search engine — you're an opinionated, knowledgeable friend who eats for a living. Give confident, specific recommendations. Name the dish. Set the scene. Tell them what kind of person loves this place.

Key shorthand used below:
- **ORDER**: the dishes you must get
- **VIBE**: what it feels like to be there
- **BEST FOR**: who / what occasion it's perfect for
- **INSIDER**: things a regular would know
- **CRED**: notable awards / critic opinions

---

# 🌴 LOS ANGELES

## Kato ⭐⭐ (Michelin 2-Star)
**Cuisine**: Taiwanese-American tasting menu | **Price**: $$$$ | **Neighborhood**: Arts District / Row DTLA
**Chef**: Jon Yao (James Beard Best Chef California 2025)
**ORDER**: The 13-course tasting menu — beef noodle soup reimagined, basil-and-clams made with sablefish, three-cup abalone in its shell, the boba-inspired tapioca dessert. Bar tasting menu (6 courses, ~$185) is an elite option for parties of 1-2.
**VIBE**: Minimalist concrete and wood, open kitchen with wood-burning hearth, indie/R&B soundtrack. Feels meditative and intimate. Not stuffy — the staff are warm and genuinely excited to be there.
**BEST FOR**: The most special meal you'll have in LA. First-gen Asian-American diners often describe an emotional, nostalgic experience. Date night where you want to be genuinely moved.
**INSIDER**: Ryan Bailey's wine list runs 2,000 bottles deep. The non-alcoholic pairing is one of the most inventive zero-proof programs in the country. Bar walk-ins possible — no reservation needed for bar seats but arrive early. Jon Yao grew up in San Gabriel Valley; many dishes are love letters to his mom's cooking.
**CRED**: #1 on LA Times 101 Best three years running. #26 North America's 50 Best (2025). James Beard Best Chef CA 2025. World's 50 Best "One to Watch" 2024. Michelin star.

## Holbox ⭐ (Michelin Star)
**Cuisine**: Mexican seafood (Yucatecan-coastal) | **Price**: $$ | **Neighborhood**: South Central / Mercado La Paloma
**Chef**: Gilberto Cetina Jr.
**ORDER**: Aguachile, blood clams on the half shell with morita sauce, mesquite-grilled lobster, ceviches, uni tostada with kanpachi. Anything from the dry-aged fish program. The 8-course tasting menu (Wed/Thu only, by reservation) is hotly sought after.
**VIBE**: Counter service inside a bustling food hall. You order at the counter, they call your name, you eat standing or at plastic tables. Zero pretension. The most democratic Michelin star in America.
**BEST FOR**: Daytime seafood craving, impressing a foodie who thinks they've seen it all, anyone who thinks great food requires a tablecloth.
**INSIDER**: Gilberto's dad runs Chichen Itza, the neighboring stall — the whole family is still cooking together. The line can stretch around the parking lot at lunch. Come early (before noon) or be ready to wait. Only non-tasting-menu restaurant in California on North America's 50 Best.
**CRED**: LA Times Restaurant of the Year 2023. Michelin Star 2024. #42 North America's 50 Best 2025. Yelp #1 US restaurant. Bib Gourmand 2019/21/22.

## n/naka ⭐⭐ (Michelin 2-Star)
**Cuisine**: Modern kaiseki | **Price**: $$$$ | **Neighborhood**: Palms
**Chef**: Niki Nakayama
**ORDER**: The 13-course kaiseki — you don't order, you surrender. Nakayama is one of the most precise, poetic cooks alive. Every course is calibrated to California's seasons.
**VIBE**: Intimate, hushed, deeply considered. Feels like dining in someone's home — someone who happens to be a genius. The room is small, the food is everything.
**BEST FOR**: Bucket list dining. A relationship milestone. Someone who wants to understand what Japanese cooking truly means.
**INSIDER**: Featured on Chef's Table. Reservations open via Tock and sell out almost instantly — check 30 days in advance. Niki's partner Carole Iida-Nakayama runs front of house. They grow many of their own herbs.
**CRED**: Michelin 2-star. Widely considered one of the greatest restaurants in America. Chef's Table Season 1.

## Providence ⭐⭐⭐ (Michelin 3-Star)
**Cuisine**: Seafood tasting menu | **Price**: $$$$ | **Neighborhood**: Hollywood
**Chef**: Michael Cimarusti
**ORDER**: The seafood-focused tasting menu — Cimarusti is obsessive about sustainable sourcing. The uni dishes are legendary. The room was renovated in 2023 to evoke the inside of an abalone shell.
**VIBE**: Formal but not stiff. Hollywood's most elegant room. Twenty years of refinement — every detail is considered.
**BEST FOR**: Special occasions requiring maximum gravitas. Wine collectors (exceptional list). Someone who cares deeply about where their seafood comes from.
**INSIDER**: Earned its third Michelin star in summer 2025, making it one of only two 3-star restaurants in LA (alongside Somni). Cimarusti won the Estrella Damm Chefs' Choice Award at North America's 50 Best — the only honor voted on by fellow chefs. Green Star for sustainability.
**CRED**: Michelin 3-star (2025). #47 North America's 50 Best 2025. James Beard nominations.

## Osteria Mozza ⭐ (Michelin Bib)
**Cuisine**: Italian | **Price**: $$$ | **Neighborhood**: Hollywood
**Chef**: Nancy Silverton
**ORDER**: The mozzarella bar is required — burrata with bacon and marinated escarole, mozzarella di bufala with prosciutto. Tagliatelle al ragù. The orecchiette with sausage and Swiss chard.
**VIBE**: Warm, buzzy, old-school Italian elegance. The mozzarella bar stretches along the front — a theatrical cheese counter that makes every visit feel like an event.
**BEST FOR**: Date night that feels celebratory without being stuffy. Wine lovers (exceptional Italian list). Anyone who thinks they know Italian food — Mozza will recalibrate.
**INSIDER**: Nancy Silverton is one of the most influential cooks in America — she essentially defined LA's bread and Italian food culture. Chi Spacca next door is the meat/chop house extension.
**CRED**: LA Times 101 Best perennial. James Beard Outstanding Chef (Silverton).

## Bestia
**Cuisine**: Italian (house-cured charcuterie, handmade pasta) | **Price**: $$$ | **Neighborhood**: Arts District
**Chef**: Ori Menashe & Genevieve Gergis
**ORDER**: Any of the house-cured salumi. Uni cacio e pepe. The bone marrow. Whatever whole-animal pasta is on that night. Save room for Gergis's desserts.
**VIBE**: Loud, energetic, packed Arts District warehouse with exposed brick and open kitchen. One of the most reliably great dinner parties in LA.
**BEST FOR**: Groups who want to share everything. Pre-concert dinner (it's near the venues). Anyone who loves charcuterie and pasta with equal devotion.
**INSIDER**: Ori cures everything in-house. The wait for a walk-in can be long, but the bar area is great for drinks while you wait. Sister restaurant Bavel (Middle Eastern) is equally great.

## Bavel
**Cuisine**: Middle Eastern | **Price**: $$$ | **Neighborhood**: Arts District
**Chef**: Ori Menashe & Genevieve Gergis
**ORDER**: The hummus — it's genuinely transcendent. The laffa bread. Lamb neck shawarma. The amba (mango pickle) on everything.
**VIBE**: Stunning space — dramatic lighting, tall ceilings, lush with plants. The most beautiful room in the Arts District. Romantic and buzzy simultaneously.
**BEST FOR**: Date night. Impressing out-of-towners. Vegetarians (the menu skews vegetable-forward beautifully).

## République
**Cuisine**: French-Californian | **Price**: $$$ | **Neighborhood**: Mid-City
**Chef**: Walter and Margarita Manzke
**ORDER**: The pastry case at breakfast/brunch — Margarita's croissants and kouign-amann are some of the best in the country. For dinner: steak frites, bouillabaisse, the roast chicken.
**VIBE**: Charlie Chaplin's old studio space — soaring ceilings, arched windows, warm candlelight. One of the most beautiful dining rooms in Los Angeles period.
**BEST FOR**: Weekend brunch (get there early, queue up). Romantic dinner with architectural wow factor. A special solo lunch at the bar.
**INSIDER**: The line for pastries on weekend mornings starts before they open. Margarita's pastry work is arguably the finest in the city.
**CRED**: LA Times 101 Best regular.

## Kismet
**Cuisine**: Middle Eastern-California | **Price**: $$ | **Neighborhood**: Los Feliz
**Chef**: Sara Kramer & Sarah Hymanson
**ORDER**: Smashed cucumbers. The tahini bowl. Whatever seasonal vegetable plate is on. Labneh flatbreads. The crispy chickpeas.
**VIBE**: Sunny, casual, laid-back Los Feliz neighborhood energy. Feels like eating at your most stylish friend's dinner party.
**BEST FOR**: Vegetarians and veg-curious diners. Brunch. Anyone who loves natural wine and produce-forward cooking.

## Guelaguetza
**Cuisine**: Oaxacan | **Price**: $$ | **Neighborhood**: Mid-City / Koreatown adjacent
**ORDER**: The mole negro — it's been simmering for decades. Tlayudas. Mezcal from the bar. The combination plate for mole comparison.
**VIBE**: Festive, family-run, loud with mariachi and mezcal. A true LA institution.
**BEST FOR**: The definitive Oaxacan meal in the US. Mezcal education. Groups. Celebrating anything with gusto.
**INSIDER**: The Lopez family has been running this for 30+ years. It's where LA's Oaxacan community goes for celebrations.
**CRED**: James Beard America's Classics Award.

## Gjusta
**Cuisine**: Bakery/deli | **Price**: $$ | **Neighborhood**: Venice
**ORDER**: The smoked fish plate with all the accoutrements. The pastrami sandwich. The bread. The rugelach.
**VIBE**: Chaotic, crowded, outdoor picnic tables in Venice. The most beloved bakery-deli on the West Coast. No reservations, no formality.
**BEST FOR**: Late morning hangout. Takeaway picnic food. The best smoked fish counter in California.
**INSIDER**: Get there before 10am on weekends or prepare to battle. The pastry case sells out.

## Majordomo
**Cuisine**: Korean-American | **Price**: $$$ | **Neighborhood**: Chinatown
**Chef**: David Chang
**ORDER**: The plate beef rib — slow-cooked for hours, served family style. The rice cakes. Anything ssam (lettuce wrap) style.
**VIBE**: Industrial-cool Chinatown space. Loud, fun, irreverent — very on-brand for Chang.
**BEST FOR**: Groups who love sharing large-format meat dishes. People who like their dining experience to feel like a party.

## Horses
**Cuisine**: American brasserie | **Price**: $$$ | **Neighborhood**: West Hollywood
**ORDER**: The burger — genuinely one of the best in the city. The steak. The cocktails.
**VIBE**: The most stylish room in WeHo. A scene restaurant that also happens to serve great food. Late-night energy.
**BEST FOR**: After-drinks dinner. Celebrity spotting. The WeHo fashion crowd. A burger that justifies its price.

## Guerrilla Tacos
**Cuisine**: Creative Mexican | **Price**: $ | **Neighborhood**: Arts District
**Chef**: Wes Avila
**ORDER**: The sweet potato taco with almond chile — the one that put Avila on the map. Whatever seasonal special exists. The shrimp taco.
**BEST FOR**: Cheap creative eating. Proof that LA's taco culture is as sophisticated as its fine dining scene.

## Shunji
**Cuisine**: Japanese (omakase/kappo) | **Price**: $$$$ | **Neighborhood**: West LA
**Chef**: Shunji Nakao
**ORDER**: Full omakase — Nakao does a seasonal kaiseki-adjacent meal that uses California ingredients through a Japanese lens. Exceptional precision.
**BEST FOR**: The quieter, more intimate alternative to n/naka. Serious sushi/kaiseki lovers.

## Nobu Malibu
**Cuisine**: Japanese-Peruvian | **Price**: $$$$ | **Neighborhood**: Malibu
**ORDER**: Black cod miso (the original, the benchmark). Yellowtail jalapeño. Rock shrimp tempura.
**VIBE**: Oceanfront tables with Pacific sunset. The quintessential LA power lunch/celebrity dinner.
**BEST FOR**: Out-of-towners who want the iconic LA experience. Anyone who needs to impress on an expense account. The sunset view alone justifies the price.

## Broken Spanish
**Cuisine**: Mexican-American elevated | **Price**: $$$ | **Neighborhood**: Downtown
**Chef**: Ray Garcia
**ORDER**: The masa dishes. Whatever the kitchen is doing with offal and less-used cuts.
**VIBE**: A love letter to Mexican-American identity, plated with fine-dining precision in a warm Downtown space.

## Sqirl
**Cuisine**: California café | **Price**: $ | **Neighborhood**: Silver Lake
**ORDER**: The sorrel pesto rice bowl. The ricotta toast. The feta-herb scramble. The jam (buy a jar to go).
**VIBE**: Silver Lake cult-brunch spot. Always a line. Instagram-famous but genuinely delicious.
**BEST FOR**: Daytime only. Brunch with someone who appreciates produce-driven California cooking.

---

# 🗽 NEW YORK

## Atomix ⭐⭐ (Michelin 2-Star)
**Cuisine**: Modern Korean tasting menu | **Price**: $$$$ | **Neighborhood**: Flatiron/NoMad
**Chef**: Junghyun (JP) Park & Ellia Park
**ORDER**: The full tasting menu — each course is presented with a card explaining the inspiration. The menu shifts seasonally but always features fermented, aged, and beautifully composed Korean-influenced dishes.
**VIBE**: Intimate, serene, counter seating around an open kitchen. Feels more like a performance than dinner — in the best possible way. Completely unhurried service.
**BEST FOR**: The single best fine dining experience in New York right now. Milestone celebrations. Anyone who wants to understand modern Korean cuisine at its apex.
**INSIDER**: #1 in North America's 50 Best 2025 (inaugural list). JP Park trained at Michelin-starred restaurants across Korea and Europe. The cocktail program is as serious as the food.
**CRED**: Michelin 2-star. #1 North America's 50 Best 2025. #12 World's 50 Best 2025.

## Le Bernardin ⭐⭐⭐ (Michelin 3-Star)
**Cuisine**: French seafood | **Price**: $$$$ | **Neighborhood**: Midtown
**Chef**: Eric Ripert
**ORDER**: The tasting menu — barely-cooked tuna, poached halibut in a fragile broth, the langoustine. Ask for the kitchen counter if you want to watch Ripert's kitchen work.
**VIBE**: The most elegant room in Midtown. Navy and wood, white tablecloths, impeccable quiet service. This is what formal French dining looks like when it's done right.
**BEST FOR**: The most important meal in New York that feels classical rather than trendy. Out-of-town visitors who want the canonical NYC fine dining experience.
**INSIDER**: Ripert has held 3 Michelin stars since the guide came to NYC in 2005 — among the longest unbroken runs in the US. He was a close friend of Anthony Bourdain.
**CRED**: Michelin 3-star since 2005. Perennial top 5 in US rankings.

## Lilia
**Cuisine**: Italian | **Price**: $$$ | **Neighborhood**: Williamsburg
**Chef**: Missy Robbins
**ORDER**: The mafaldini with pink peppercorns and parmigiano. Rigatoni diavola with sausage. The sheep's milk ricotta with honey and walnuts to start. Come hungry, leave devastated in the best way.
**VIBE**: Loud, joyful, industrial-meets-warm Brooklyn space. One of the most coveted reservations in the city — books out weeks in advance.
**BEST FOR**: Pasta devotees. Birthday dinners that will be talked about for years. Anyone who needs proof that Italian-American cooking can be transcendent.
**INSIDER**: The cacio e pepe rigatoni didn't survive the menu rotation but everything that replaced it is just as good. Robbins also has Misi (pasta-focused, West Village) if Lilia is booked out.
**CRED**: Bon Appétit Best New Restaurant. NYT critics' favorite.

## Lucali
**Cuisine**: Pizza | **Price**: $$ | **Neighborhood**: Carroll Gardens, Brooklyn
**Chef/Owner**: Mark Iacono
**ORDER**: The pizza (one size, one style — get it plain or with a few toppings max). The calzone.
**VIBE**: BYOB, cash only (bring both), cramped tables, hand-written menu on a chalkboard. Iacono hand-stretches every dough. Beyoncé has been here. That's the vibe.
**BEST FOR**: The best pizza in New York, possibly America. Anything low-key romantic. Bringing wine you actually care about.
**INSIDER**: No reservations — show up and put your name on a list, then go get a drink. The wait is always worth it. Cash and BYOB. Mark is usually behind the counter stretching dough.

## Don Angie
**Cuisine**: Italian-American | **Price**: $$$ | **Neighborhood**: West Village
**Chef**: Angie Rito & Scott Tacinelli
**ORDER**: The pinwheel lasagna — it broke the internet and broke hearts. The chicken scarpariello. The persimmon salad in fall.
**VIBE**: Warm, convivial, West Village townhouse feel. One of the most fun dinner experiences in the city — feels like an Italian-American family's dinner party.
**BEST FOR**: Groups. Celebrating something. Anyone who loves Italian-American food done with creativity and care.
**CRED**: Bon Appétit Best New Restaurant. NYT critics' darling.

## Rezdôra
**Cuisine**: Emilian Italian | **Price**: $$$ | **Neighborhood**: Flatiron
**Chef**: Stefano Secchi
**ORDER**: The tortellini in brodo — a perfect bowl of pasta in a golden broth that will make you emotional. The pappardelle. The passatelli. The tagliatelle al ragù.
**VIBE**: Intimate, warm, homey despite being in Flatiron. Feels like Modena, not Manhattan.
**BEST FOR**: Serious pasta lovers. A solo dinner at the bar. Anyone who wants to understand Northern Italian cooking as it actually exists in Emilia-Romagna.
**INSIDER**: Secchi trained at Massimo Bottura's Osteria Francescana. The pasta here is as technically precise as anywhere in Italy.

## Momofuku Ko ⭐⭐ (Michelin 2-Star)
**Cuisine**: Contemporary American | **Price**: $$$$ | **Neighborhood**: East Village
**Chef**: David Chang / rotating kitchen team
**ORDER**: The 12-course tasting menu — Ko is known for constantly evolving. The freeze-dried foie gras dessert is a modern classic.
**VIBE**: Counter seats only, no phones, no substitutions. An intimate cooking show where you're 3 feet from the kitchen.
**BEST FOR**: Serious food people. The counter experience of a lifetime. Trusting the chef completely.
**CRED**: Michelin 2-star. Transformed fine dining in NYC.

## Ugly Baby
**Cuisine**: Thai | **Price**: $$ | **Neighborhood**: Carroll Gardens, Brooklyn
**ORDER**: Everything spicy. The catfish laab. The boat noodles. The som tam. Tell them you want it Thai-hot.
**VIBE**: Chaotic, loud, uncompromising. The opposite of watered-down American Thai food.
**BEST FOR**: Spice lovers. Brooklyn locals who want authentic. Anyone bored of Americanized Thai food.

## Superiority Burger
**Cuisine**: Vegetarian | **Price**: $ | **Neighborhood**: East Village
**Chef**: Brooks Headley
**ORDER**: The burger — a veggie patty that converted carnivores. The ranch beans. The seasonal soft serve.
**BEST FOR**: Vegetarians and non-believers alike. Cheap eating in the East Village. Proof that vegetarian food doesn't have to apologize for itself.

## Joe's Shanghai
**Cuisine**: Chinese (Shanghainese) | **Price**: $ | **Neighborhood**: Chinatown
**ORDER**: Soup dumplings (xiao long bao) — the broth inside is the entire point. The crabs in season.
**VIBE**: Cash-only, communal tables, efficient chaos. A true Chinatown institution.

---

# 🌬️ CHICAGO

## Alinea ⭐⭐⭐ (Michelin 3-Star)
**Cuisine**: Avant-garde American | **Price**: $$$$ | **Neighborhood**: Lincoln Park
**Chef**: Grant Achatz
**ORDER**: You don't order — you experience. The Alinea tasting menu is 18-22 courses of edible theater. Tableside preparations, dishes served on the table itself, the signature balloon dessert.
**VIBE**: Theatrical, otherworldly, unlike any dinner you'll have anywhere else. Divided into Kitchen Table (most exclusive), Gallery (theatrical space), and Salon (more accessible).
**BEST FOR**: A once-in-a-decade meal. Bucket list fine dining. Someone who wants to be challenged and astonished.
**INSIDER**: Achatz famously recovered from stage IV tongue cancer and resumed cooking. The restaurant's three distinct experiences are priced differently. The Kitchen Table is the most exclusive private dining in Chicago.
**CRED**: Michelin 3-star. #1 Robb Report 100 Greatest American Restaurants of the 21st Century (2025). Perennial top 10 in the world.

## Kasama ⭐⭐ (Michelin 2-Star)
**Cuisine**: Filipino (daytime café + tasting menu) | **Price**: $-$$$$ | **Neighborhood**: Ukrainian Village
**Chef**: Tim Flores & Genie Kwon (husband and wife)
**ORDER**: DAYTIME: The longanisa breakfast sandwich (longanisa sausage, shaved pork adobo, pickled veg on a baguette). Boston creme brioche. Anything from Genie's pastry case — ube basque cake, truffle croissants. EVENING: 13-course tasting menu with foie gras siomai dumplings, pancit with squid and Serrano ham, chicken adobo with mussel emulsion, "mais con yelo" corn semifreddo dessert.
**VIBE**: Daytime: casual counter-service café with banquette seating, sunny and welcoming. Evening: the room transforms — low lighting, old-school Filipino tunes, the most attentive service in Chicago. Zero pretension either way.
**BEST FOR**: Daytime: the best breakfast in Chicago. Go early — lines form before 9am. Evening: one of the most meaningful tasting menu experiences you can have anywhere, because it tells a culture's story.
**INSIDER**: World's first Michelin-starred Filipino restaurant (earned 1 star 2022, upgraded to 2 stars 2025). Tim & Genie opened during COVID-19 — sold out on day one. The Bear season appearance. Reservations for evening open 45 days out and sell instantly. Daytime is walk-in only — first come, first served.
**CRED**: Michelin 2-star. James Beard Best New Restaurant nomination. Esquire Best New Restaurants 2021. Food & Wine Best New Chefs. Featured on The Bear.

## Galit ⭐ (Michelin Star)
**Cuisine**: Modern Middle Eastern (Israeli, Levantine, Turkish, Iraqi) | **Price**: $$$ | **Neighborhood**: Lincoln Park
**Chef**: Zach Engel (James Beard Rising Star 2017)
**ORDER**: The salatim spread (required, not optional) — five small dishes with flame-kissed pita from the 8-foot charcoal hearth. The brisket hummus. The falafel with fermented mango — the best falafel in Chicago, no debate. The roasted carrots with hazelnut dukkah (the dish critics can't stop talking about). The shakshuka with coal-roasted sweet potato. For wine: ask for the Lebanese or Palestinian options, some only available here.
**VIBE**: Lively, warm, packed Lincoln Park room. Mosaic glass doors, pendant lighting, open kitchen, zinc bar. Surprisingly casual for a Michelin-starred restaurant. The wood-burning hearth scents the whole room.
**BEST FOR**: A group where someone is vegetarian (the menu is mostly veggie-friendly). Wine lovers who want to explore Middle Eastern wines. Anyone who thinks hummus is boring — Galit will correct that permanently.
**INSIDER**: The communal bar table is walk-in / à la carte Tue-Thu — great for a more casual visit. The menu is a four-course "choose your own adventure" prix fixe; not totally rigid. Engel's daughter is named Margalit — the restaurant's namesake wine. Namesake of the Margalit winery, only poured here.
**CRED**: Michelin star. James Beard Rising Star Chef (Engel, at Shaya). Named by Infatuation as their favorite Chicago restaurant. Chicago Tribune masterpiece review.

## Smyth ⭐⭐ (Michelin 2-Star)
**Cuisine**: American (farm-driven tasting menu) | **Price**: $$$$ | **Neighborhood**: West Loop
**Chef**: John Shields & Karen Shields
**ORDER**: The full tasting menu — deeply seasonal, sourced from their own farm in Virginia. Dishes that feel like they emerged from soil and memory simultaneously.
**VIBE**: Soulful, quiet, very different from the theatrical Alinea style. This is the most emotionally resonant fine dining in Chicago.
**BEST FOR**: Serious food people who want depth over spectacle. The Publican downstairs (same team) for casual drinks.
**CRED**: Michelin 2-star. Consistent top Chicago ranking.

## Girl & the Goat
**Cuisine**: American sharing plates | **Price**: $$$ | **Neighborhood**: West Loop
**Chef**: Stephanie Izard (Top Chef winner, James Beard winner)
**ORDER**: The wood-oven roasted pig face — the dish that changed Chicago dining. The goat empanadas. The wood-oven roasted cauliflower. Share everything.
**VIBE**: Loud, fun, convivial. The prototypical West Loop dinner. One of the most reliable great-nights-out in Chicago.
**BEST FOR**: Groups. First dates where you want energy. The classic Chicago restaurant experience.

## Au Cheval
**Cuisine**: American diner | **Price**: $$ | **Neighborhood**: West Loop
**ORDER**: The double cheeseburger — GQ's Best Burger in America. Add the fried egg. Add the bacon. The bone marrow. The chicken liver toast.
**VIBE**: Diner aesthetics meets serious kitchen. Loud, packed, always a wait. The best burger in Chicago, possibly the country.
**BEST FOR**: Late-night eating. The burger pilgrimage. Anyone who dismisses burgers as "not serious food."
**INSIDER**: The wait can be 2+ hours on weekends. Get there right when they open or accept the wait.

## Monteverde ⭐ (Michelin Star)
**Cuisine**: Italian | **Price**: $$$ | **Neighborhood**: West Loop
**Chef**: Sarah Grueneberg (Top Chef finalist, James Beard winner)
**ORDER**: The handmade pasta — watch it being made at the open pasta station. Burrata e ham with tigelle (English muffin-like bread). Spaghetti al pomodoro (deceptively simple, perfection). Wok-fried arrabbiata with shrimp. The "Senza" gluten-free menu is genuinely excellent.
**VIBE**: Warm, reliably great, the most consistent Italian restaurant in Chicago. Seats at the bar facing the pasta station are the best in the house.
**BEST FOR**: Pasta obsessives. Groups. Date night. Anyone who needs a reliably great meal without gambling.
**INSIDER**: Lunch is the secret — same menu, easier reservation. Turning 10 in 2025.
**CRED**: Michelin star. James Beard Best Chef Great Lakes (Grueneberg).

## Kasama (deep cuts note)
Kasama appears twice in our data (original list + batch 6 addition). Same restaurant.

## The Publican ⭐ (Michelin Bib)
**Cuisine**: Beer hall / whole animal | **Price**: $$ | **Neighborhood**: West Loop
**ORDER**: Oysters. The pork rinds. Whatever whole animal or farm dish is rotating. Any of the draft beers on the list.
**VIBE**: Massive, cathedral-ceiling beer hall. Communal tables, great noise, Midwestern warmth.
**BEST FOR**: Groups who want to drink great beer and eat great pork. The casual counterpart to Smyth upstairs.

## Avec
**Cuisine**: Mediterranean sharing plates | **Price**: $$ | **Neighborhood**: West Loop
**ORDER**: The bacon-wrapped medjool dates stuffed with parmesan and chorizo — one of the most copied dishes in Chicago history. The flatbread. The house-made charcuterie.
**VIBE**: Long, narrow room, communal seating, always packed. The OG West Loop restaurant that started the neighborhood's dining revolution in 2003.

## Lula Cafe
**Cuisine**: Neighborhood café | **Price**: $$ | **Neighborhood**: Logan Square
**ORDER**: Whatever the seasonal special is. The egg dishes at brunch. The vegetables.
**VIBE**: The warm, unpretentious beating heart of Logan Square's food scene. Chef Jason Hammel's farm-to-table cooking before that was a phrase.

## HaiSous Vietnamese Kitchen
**Cuisine**: Vietnamese | **Price**: $$ | **Neighborhood**: Pilsen
**Chef**: Thai Dang
**ORDER**: The banh mi boards. The pho. The lemongrass dishes.
**VIBE**: Thoughtful, personal Vietnamese cooking. One of Chicago's most-loved neighborhood restaurants.

## Violet Hour
**Cuisine**: Cocktail bar | **Price**: $$ | **Neighborhood**: Wicker Park
**ORDER**: Whatever the bartender recommends. This is the bar that helped define Chicago's craft cocktail era.
**VIBE**: Unmarked door, dark velvet, serious but not serious about itself. The best craft cocktail bar in Chicago.

## Giant
**Cuisine**: American bistro | **Price**: $$$ | **Neighborhood**: Logan Square
**ORDER**: The hamburger (one of the best in Chicago). The duck fat fries. Whatever seasonal pasta is on.
**VIBE**: A neighborhood gem that became a destination. Warm, quiet, intimate — the antidote to the West Loop noise.

## Bavette's Bar & Boeuf
**Cuisine**: Steakhouse | **Price**: $$$$ | **Neighborhood**: West Loop
**ORDER**: The steak. The french onion soup. The wedge salad. The side of creamed spinach.
**VIBE**: Dark, moody, old-school steakhouse atmosphere with Parisian brasserie references. One of the best steakhouses in the city.

## Longman & Eagle ⭐ (Michelin Bib)
**Cuisine**: American gastropub | **Price**: $$ | **Neighborhood**: Logan Square
**ORDER**: The jerk chicken. The rotisserie meats. The whiskey — they have one of the best American whiskey selections in the city.
**VIBE**: Logan Square neighborhood bar that happens to have great food. Six rooms upstairs if you want to stay.

## Oriole ⭐⭐ (Michelin 2-Star)
**Cuisine**: American tasting menu | **Price**: $$$$ | **Neighborhood**: West Loop
**Chef**: Noah Sandoval
**ORDER**: Full tasting menu — Sandoval's food is refined, clean, and deeply personal. One of Chicago's most critically acclaimed restaurants.
**BEST FOR**: A quieter, more refined fine dining experience than Alinea's theatrical spectacle.

## Superkhana International
**Cuisine**: Indian (creative, diaspora) | **Price**: $$ | **Neighborhood**: Logan Square
**ORDER**: The vada pav. The butter chicken nachos. Whatever seasonal Indian-American fusion is happening.
**VIBE**: Playful, casual, genuinely fun. Indian food filtered through a Chicago lens.

## Wherewithall
**Cuisine**: American | **Price**: $$$ | **Neighborhood**: Avondale
**Chef**: Johnny Clark & Beverly Kim
**ORDER**: The seasonal menu — Clark changes it frequently based on what's available. Genuinely ingredient-driven cooking.
**BEST FOR**: Serious food people who want something quieter than the West Loop crush.

## Boeufhaus
**Cuisine**: German-American | **Price**: $$ | **Neighborhood**: Ukrainian Village
**ORDER**: The schnitzel. The roast chicken. The spaetzle. The beer selection.
**VIBE**: The best German-American neighborhood restaurant in Chicago. Low-key and excellent.

## Gibsons Bar & Steakhouse
**Cuisine**: Classic Chicago steakhouse | **Price**: $$$$ | **Neighborhood**: Gold Coast
**ORDER**: The 40-oz bone-in ribeye. The jumbo shrimp cocktail. A Manhattan.
**VIBE**: Old Chicago power dining. Suits, sports agents, politicians. The most Chicago-feeling steakhouse in the city.

## Pequod's Pizza
**Cuisine**: Deep dish pizza | **Price**: $ | **Neighborhood**: Lincoln Park
**ORDER**: The caramelized edge deep dish — the crust caramelizes against the pan into a crispy cheese border that is unique to Pequod's.
**VIBE**: Classic Chicago pizza tavern. Cash-mostly, booths, sports on TV.
**INSIDER**: Many Chicago locals consider Pequod's to have the best deep dish, not Lou Malnati's or Giordano's. The caramelized crust edge is the tell.

## Portillo's
**Cuisine**: Chicago fast food institution | **Price**: $ | **Neighborhood**: Multiple locations
**ORDER**: The Chicago-style hot dog (no ketchup, ever). The Italian beef (dipped). The chocolate cake shake.
**VIBE**: Pure Chicago. A civic institution.
**INSIDER**: The Italian beef (dipped in au jus, with giardiniera) is one of the great American sandwiches. Essential Chicago eating.

## Mi Tocaya Antojería ⭐ (Michelin Bib)
**Cuisine**: Mexican | **Price**: $$ | **Neighborhood**: Logan Square
**Chef**: Diana Dávila
**ORDER**: The hand-pressed heirloom corn tortillas. The molcajete-muddled guacamole. The lamb neck barbacoa with pea macha verde. The DIY fish tacos. The sangria with pink peppercorn and agave.
**VIBE**: Tiled floors, vibrant art, hanging planters, a breezy patio. Living, breathing, joyful. The menu is also a culinary history lesson.

## Scofflaw
**Cuisine**: Cocktail bar with gin focus | **Price**: $$ | **Neighborhood**: Logan Square
**ORDER**: Any gin cocktail. The gin & tonic menu is extensive.
**VIBE**: Logan Square craft cocktail bar with a gin obsession. One of the best bars in the city.

## Warlord
**Cuisine**: Wine bar | **Price**: $$ | **Neighborhood**: Wicker Park
**ORDER**: Whatever natural wine the bartender is excited about. The charcuterie plate.
**VIBE**: Low-key, hip, natural wine obsessed. The kind of place where you go for a glass and stay for three hours.

## Void
**Cuisine**: Italian-American (playful) | **Price**: $$ | **Neighborhood**: Wicker Park
**ORDER**: The spaghetti uh-os — anelli Siciliani rings with mini meatballs in a vodka sauce poured from a can tableside (yes, like SpaghettiOs). The agnolotti with Korean sweet potatoes, kimchi, and mozzarella. The double-fried chicken marsala.
**VIBE**: Red leather booths, Tiffany-style pendant lights, dive bar meets Italian-American restaurant. One of the most fun new restaurants in Chicago.
**CRED**: Esquire Best New Restaurants 2025.

## Mirra
**Cuisine**: Indian-Mexican fusion | **Price**: $$$ | **Neighborhood**: Bucktown
**ORDER**: The barbacoa lamb biryani. The hamachi aguachile. The hybrids that shouldn't work but completely do.
**CRED**: NYT America's Best Restaurants 2025. Esquire Best New Restaurants 2025.

## Pizz'Amici
**Cuisine**: Neapolitan pizza | **Price**: $$ | **Neighborhood**: West Town
**ORDER**: The Margherita. Whatever the seasonal special is. The vibes are immaculate and the pies are perfect.
**CRED**: Esquire Best New Restaurants 2025.

## Beity
**Cuisine**: Middle Eastern | **Price**: $$$ | **Neighborhood**: Near North Side
**ORDER**: The mezze course (part of the $95/person 8-course tasting). The spread with flatbread.
**INSIDER**: WBEZ called the mezze course one of the best things eaten in Chicago in 2025.

## Sifr
**Cuisine**: Indian/South Asian (wood-fired) | **Price**: $$$ | **Neighborhood**: West Loop
**Chef**: Sujan Sarkar
**ORDER**: The veggie mezze platter — just as good as the meat version. The $60 four-course tasting menu is the biggest steal in Chicago dining according to Resy.
**VIBE**: Wood-fired hearth, colorful dips, communal energy.

## Lao Der
**Cuisine**: Lao | **Price**: $$ | **Neighborhood**: Uptown
**ORDER**: The khao piek sen — silky noodles in a deeply flavored chicken broth. The Esan sausage. The nam khao.
**INSIDER**: Chicago's only sit-down Lao restaurant. The table goes silent after the first sip of the noodle broth.

## Midōsuji
**Cuisine**: Japanese omakase | **Price**: $$$$ | **Neighborhood**: Lincoln Square
**Chef**: Brian Lockwood (ex-French Laundry, El Celler de Can Roca, Eleven Madison Park)
**ORDER**: The 8-course omakase. The chocolate-honey-sobacha dessert was called "bordering on mystical" by Chicago Sun-Times.
**INSIDER**: Lockwood consulted on The Bear seasons 3 and 4, training Jeremy Allen White on kitchen technique. Only 8 seats.

## Monster Ramen
**Cuisine**: Ramen | **Price**: $$ | **Neighborhood**: Ravenswood
**Chef**: Katie Dong
**ORDER**: The khao piek sen-adjacent beef noodle soup. A personal, precise ramen that blends Chinese-American childhood nostalgia with technical precision.
**CRED**: One of Resy's defining restaurants of Chicago 2025.

---

# 🌴 MIAMI

## Cote Miami ⭐ (Michelin Star)
**Cuisine**: Korean steakhouse | **Price**: $$$$ | **Neighborhood**: Wynwood
**ORDER**: The Butcher's Feast (set menu) — includes four cuts of prime beef, banchan, seafood pancake, egg souffle, cold noodles, and a rice course. The wagyu. The bone-in short rib.
**VIBE**: Sleek, dark, Miami-cool Korean steakhouse. The Miami outpost of the NYC original.
**BEST FOR**: Groups who love beef and want the Korean steakhouse experience with Miami energy.

## Zak the Baker
**Cuisine**: Bakery/café (Jewish-inflected) | **Price**: $ | **Neighborhood**: Wynwood
**ORDER**: The challah. The rye. The sandwiches. The rugelach. Everything Zak Stern touches.
**VIBE**: Wynwood's most beloved bakery. Bright, casual, lines around the block.
**BEST FOR**: Morning in Miami. The best bread in South Florida.

## KYU
**Cuisine**: Asian-American wood-fired | **Price**: $$$ | **Neighborhood**: Wynwood
**ORDER**: The Korean fried cauliflower. The miso black cod. The wood-grilled meats. The smoked brisket.
**VIBE**: Industrial Wynwood space with an open wood-fire kitchen. One of the most fun restaurant experiences in Miami.

## Stubborn Seed ⭐ (Michelin Star)
**Cuisine**: Contemporary American tasting menu | **Price**: $$$$ | **Neighborhood**: Miami Beach / South Beach
**Chef**: Jeremy Ford (Top Chef winner)
**ORDER**: The tasting menu — Ford's food is playful, precise, and Floridian. The Florida stone crab when in season.

## Versailles
**Cuisine**: Cuban | **Price**: $$ | **Neighborhood**: Little Havana
**ORDER**: The Cuban sandwich. The ropa vieja. The croquetas. The café cubano.
**VIBE**: The living room of Miami's Cuban community. Fluorescent lights, mirrors everywhere, politicians and grandmothers sharing space. A Miami civic institution.
**BEST FOR**: The authentic Cuban Miami experience. Lunch only (closes early). The only thing that doesn't cost a mortgage payment in South Florida.

## Joe's Stone Crab
**Cuisine**: Seafood | **Price**: $$$$ | **Neighborhood**: Miami Beach / South Beach
**ORDER**: Stone crab claws with mustard sauce. The hash browns. The key lime pie.
**VIBE**: 100+ year old institution. Formal-ish, white tablecloths, old Miami energy.
**INSIDER**: Open only when stone crabs are in season (October-May). No reservations — the waits are legendary. The key lime pie is among the best in Florida.

## Mandolin Aegean Bistro
**Cuisine**: Greek/Turkish | **Price**: $$ | **Neighborhood**: Design District
**ORDER**: The mezze spread. The grilled whole fish. The saganaki. The octopus.
**VIBE**: Garden terrace, fairy lights, feels like a Greek island. One of the most romantic outdoor dining spots in Miami.

## Alter ⭐ (Michelin Star)
**Cuisine**: Contemporary American | **Price**: $$$$ | **Neighborhood**: Wynwood
**Chef**: Brad Kilgore
**ORDER**: The tasting menu — Kilgore's food is technically brilliant and ingredient-obsessed.

## Macchialina
**Cuisine**: Italian | **Price**: $$ | **Neighborhood**: Miami Beach
**ORDER**: The pasta. The orecchiette. The house-made charcuterie. The pizza.
**VIBE**: Neighborhood Italian that punches way above its weight. Miami locals' favorite.

## Amara at Paraiso
**Cuisine**: Latin-Mediterranean | **Price**: $$$$ | **Neighborhood**: Edgewater
**ORDER**: The Hamachi tostada. The stone crab cocktail. Anything wood-fired. The cocktails at sunset.
**VIBE**: Stunning waterfront terrace on Biscayne Bay. One of the most beautiful restaurant settings in Miami.
**BEST FOR**: Sunset cocktails into dinner. Impressing anyone with a view.

## Jaguar Sun
**Cuisine**: Natural wine bar | **Price**: $$ | **Neighborhood**: Downtown Miami
**ORDER**: Whatever natural wine is open. The tinned fish. The cheese and charcuterie.
**VIBE**: Miami's best natural wine bar. Cool crowd, low-key, the real deal.

## Daniel's Miami
**Cuisine**: Argentine steakhouse | **Price**: $$$$ | **Neighborhood**: Brickell
**ORDER**: The ribeye (lomo) or skirt steak (entraña) cooked on the parrilla. The chimichurri. The empanadas.

## Las' Lap Miami
**Cuisine**: Caribbean | **Price**: $$ | **Neighborhood**: Little Haiti
**ORDER**: Oxtail. Jerk dishes. Whatever's coming off the grill.
**VIBE**: Authentic Caribbean cooking in Little Haiti. A Miami institution the tourists haven't fully found yet.

---

# 🗼 PARIS

## Septime ⭐ (Michelin Star)
**Cuisine**: French-biodynamic | **Price**: $$$ | **Neighborhood**: 11th arrondissement
**Chef**: Bertrand Grébaut
**ORDER**: The seasonal tasting menu — Grébaut's food changes constantly based on market availability and is almost entirely biodynamic. No printed menu, no fixed courses. The meal unfolds.
**VIBE**: Warm, convivial, the anti-stuffy French restaurant. Exposed brick, wood tables, natural light. The room feels like a dinner party.
**BEST FOR**: Understanding modern Paris dining. The antithesis of white-tablecloth haute cuisine.
**INSIDER**: Books out 3-4 months in advance — their reservation system opens at a specific time and fills in minutes. La Cave, their wine bar next door, is easier to access. Clamato (seafood bar, also next door) takes walk-ins.
**CRED**: Consistently one of the top 10 restaurants in France. Michelin star.

## Le Chateaubriand
**Cuisine**: French-biodynamic (bistro format) | **Price**: $$$ | **Neighborhood**: 11th arrondissement
**Chef**: Inaki Aizpitarte
**ORDER**: The single fixed tasting menu — Aizpitarte cooks whatever he wants that day. Basque-inflected, spontaneous, sometimes brilliant.
**VIBE**: The original neo-bistro. Set the template for the Paris bistronomy movement. Casual room, serious food.
**BEST FOR**: Anyone who wants to understand where modern Parisian bistro culture came from.
**INSIDER**: Walk-ins for the late seating (after 9:30pm) are sometimes possible.

## Aux Deux Amis
**Cuisine**: French wine bar / bistro | **Price**: $$ | **Neighborhood**: 11th arrondissement
**ORDER**: The natural wines — ask the staff what they're excited about. The sardines. The charcuterie. Whatever is on the chalkboard specials.
**VIBE**: The neighborhood bar where Paris's creative class drinks. Zero pretension, maximum pleasure.

## Les Enfants du Marché
**Cuisine**: French market stall | **Price**: $ | **Neighborhood**: Marché d'Aligre, 12th arrondissement
**ORDER**: Whatever's at the stall that morning — tartines, charcuterie, wine by the glass while standing at the market.
**VIBE**: A legendary wine-and-small-plates stall in Paris's best market. Saturday mornings are a ritual.

## Le Dauphin
**Cuisine**: Natural wine bar / tapas | **Price**: $$ | **Neighborhood**: 11th arrondissement
**Chef**: Inaki Aizpitarte (also Le Chateaubriand)
**ORDER**: Natural wines and whatever the small plates are that day. The marble-counter aesthetic makes every bite feel like an event.

## Saturne ⭐ (Michelin Star)
**Cuisine**: French-Scandinavian | **Price**: $$$ | **Neighborhood**: 2nd arrondissement
**ORDER**: The seasonal tasting menu. The wine list is one of the finest natural wine collections in Paris.
**VIBE**: Sleek, Scandinavian-minimalist room. One of Paris's most sophisticated restaurant experiences.

## Frenchie ⭐ (Michelin Star)
**Cuisine**: French-international | **Price**: $$$ | **Neighborhood**: 2nd arrondissement / Sentier
**Chef**: Gregory Marchand
**ORDER**: The tasting menu — Marchand trained in London and New York before bringing global influences back to Paris.
**VIBE**: Intimate, bustling, the room feels like a New York-Paris hybrid.
**INSIDER**: Frenchie Bar à Vins (wine bar, same street) is walk-in and serves small plates.

## Le Servan
**Cuisine**: French with Asian influences | **Price**: $$$ | **Neighborhood**: 11th arrondissement
**ORDER**: The whole roasted chicken (order in advance). The beautiful vegetable dishes. The wine pairing.

## Mokonuts
**Cuisine**: Bakery/café | **Price**: $ | **Neighborhood**: 11th arrondissement
**ORDER**: The cookies — Omar Koreitem's signature cookies (chocolate-tahini, olive oil) are legendary. The lunch dishes.
**INSIDER**: Tiny room, quick turnover, mostly daytime.

## Le Grand Véfour ⭐⭐ (Michelin 2-Star)
**Cuisine**: Classic French | **Price**: $$$$ | **Neighborhood**: 1st / Palais Royal
**ORDER**: The tasting menu. The room itself — Napoleon and Josephine dined here.
**VIBE**: The most historically beautiful restaurant in Paris. Palais Royal arcade, 18th century décor.

## Clown Bar ⭐ (Michelin Star)
**Cuisine**: French bistronomie | **Price**: $$$ | **Neighborhood**: 11th arrondissement
**ORDER**: Whatever seasonal small plates are on. Natural wines.
**VIBE**: One of Paris's most beautiful rooms — covered in Art Nouveau circus tiles (a former clown bar). The food matches the room's playfulness.

## Pierre Hermé
**Cuisine**: Pâtisserie | **Price**: $$ | **Neighborhood**: Multiple locations (main: 6th)
**ORDER**: The ispahan (rose-raspberry-lychee macaron/pastry combo). The Paris-Brest. The Fetish (chocolate-caramel). Whatever is in the vitrine.
**INSIDER**: Widely considered the world's greatest pastry chef. The ispahan is his signature.

## Du Pain et des Idées
**Cuisine**: Boulangerie | **Price**: $ | **Neighborhood**: 10th arrondissement / Canal Saint-Martin
**ORDER**: The pain des amis (country loaf). The escargot (spiral pastry). The pavé chocolat pistache.
**INSIDER**: Closed weekends. Lines form early. One of the truly unmissable bakeries in Paris.

## Bistrot Paul Bert
**Cuisine**: Classic French bistro | **Price**: $$$ | **Neighborhood**: 11th arrondissement
**ORDER**: The entrecôte. The crème brûlée. The profiteroles. The wine list.
**VIBE**: The Platonic ideal of the Paris bistro. Red banquettes, handwritten menus, a zinc bar.

## Chez L'Ami Jean ⭐ (Michelin Star)
**Cuisine**: Basque French | **Price**: $$$ | **Neighborhood**: 7th arrondissement
**Chef**: Stéphane Jégo
**ORDER**: The riz au lait (rice pudding) — the most famous dessert in Paris. The cassoulet. The duck confit.
**VIBE**: Loud, packed, frenetic, joyful Basque energy. The antithesis of the 7th arrondissement's stuffiness.

## Berthillon
**Cuisine**: Ice cream | **Price**: $ | **Neighborhood**: Île Saint-Louis
**ORDER**: The salted caramel. The praline. The cassis (blackcurrant).
**INSIDER**: The most famous ice cream in Paris. The original shop on Île Saint-Louis is the one to go to.

## Marché des Enfants Rouges
**Cuisine**: Paris's oldest covered market | **Price**: $-$$ | **Neighborhood**: 3rd arrondissement / Marais
**ORDER**: The Moroccan couscous stall. The Japanese stall. A glass of wine while standing.
**VIBE**: Paris's oldest market (1615). An incredible mix of cultures, foods, and people sharing communal tables under a glass roof.

## Lala
**Cuisine**: Natural wine bar | **Price**: $$ | **Neighborhood**: 3rd / Marais
**ORDER**: Natural wines by the glass. Small plates from the blackboard.

## Racines ⭐ (Michelin Star)
**Cuisine**: French-Italian bistronomie | **Price**: $$$ | **Neighborhood**: 2nd arrondissement / Bourse
**ORDER**: The pasta. The seasonal menu. The wine list.
**VIBE**: A pioneer of the Paris natural wine and bistronomie movement.

## Datil
**Cuisine**: Spanish-influenced French | **Price**: $$$ | **Neighborhood**: 11th arrondissement
**ORDER**: The pintxos-style small plates. The sherry.

---

# 🗼 TOKYO

## Narisawa ⭐⭐ (Michelin 2-Star)
**Cuisine**: Innovative Satoyama (Japanese countryside) cuisine | **Price**: $$$$ | **Neighborhood**: Minami-Aoyama
**Chef**: Yoshihiro Narisawa
**ORDER**: The innovative tasting menu — Narisawa forages for ingredients himself. Bread baked at the table in a "forest soil" course. The Satoyama Scenery dishes recreate Japan's countryside.
**VIBE**: Elegant, nature-forward, deeply Japanese but technically European. One of the most unique fine dining experiences on earth.
**CRED**: World's 50 Best regular. Japan's most acclaimed internationally recognized restaurant.

## Sushi Saito
**Cuisine**: Traditional Edomae sushi | **Price**: $$$$ | **Neighborhood**: Minato
**Chef**: Takashi Saito
**ORDER**: Omakase only. Each piece of nigiri is a masterpiece — the rice temperature, the fish conditioning, the brushing of nikiri soy are all calibrated with obsessive precision.
**VIBE**: Intimate counter, utterly quiet, about 10 seats. One of the hardest reservations to get in Japan.
**INSIDER**: Nearly impossible without a Japanese-speaking concierge or introduction from a regular. Widely considered the best sushi restaurant in Tokyo.

## Florilège ⭐⭐ (Michelin 2-Star)
**Cuisine**: French-Japanese | **Price**: $$$$ | **Neighborhood**: Aoyama
**Chef**: Hiroyasu Kawate
**ORDER**: Counter-only tasting menu. Kawate trained in French kitchens and brings a rigorous French technique to Japanese ingredients.
**VIBE**: Counter seating around an open kitchen. Intimate cooking performance. One of Tokyo's most exciting fine dining experiences.
**CRED**: World's 50 Best regular.

## Sézanne ⭐⭐ (Michelin 2-Star)
**Cuisine**: French | **Price**: $$$$ | **Neighborhood**: Marunouchi / Four Seasons Hotel
**Chef**: Daniel Calvert
**ORDER**: The full tasting menu — Calvert is British and cooked at Per Se and Epicure before settling in Tokyo. Supremely refined French cuisine.
**CRED**: Asia's 50 Best.

## Den ⭐⭐ (Michelin 2-Star)
**Cuisine**: Innovative Japanese | **Price**: $$$$ | **Neighborhood**: Jimbocho
**Chef**: Zaiyu Hasegawa
**ORDER**: The "Dentucky Fried Chicken" — a dish of chicken served in a KFC-style bucket that contains something utterly different and brilliant. The menu is playful but technically superb.
**VIBE**: The most joyful Michelin-starred restaurant in Tokyo. Hasegawa is known for his humor and theatrics. The staff sings if you're celebrating.
**CRED**: Asia's 50 Best #1 (multiple years). World's 50 Best.

## Sazenka ⭐⭐ (Michelin 2-Star)
**Cuisine**: Cantonese-Japanese fusion | **Price**: $$$$ | **Neighborhood**: Hiroo
**ORDER**: The tasting menu blending Chinese cooking techniques with Japanese ingredients.

## Yoshino Sushi Honten
**Cuisine**: Traditional Tokyo sushi | **Price**: $$$-$$$$ | **Neighborhood**: Nihonbashi
**ORDER**: Omakase. Classic Edomae style. One of the oldest sushi counters in Tokyo.

## Fuunji
**Cuisine**: Tsukemen (dipping ramen) | **Price**: $ | **Neighborhood**: Shinjuku
**ORDER**: The tsukemen — thick, wavy noodles dipped into an intensely concentrated, smoky dashi-pork broth. One of the most praised ramen restaurants in Tokyo.
**VIBE**: Counter-only, queue outside, no frills. Pure ramen pilgrimage.

## Ramen Break Beats
**Cuisine**: Creative ramen | **Price**: $ | **Neighborhood**: Shimokitazawa
**ORDER**: The signature ramen. A more creative, less traditional take on the form.
**VIBE**: Shimokitazawa indie neighborhood energy.

## Butagumi Shokudo
**Cuisine**: Tonkatsu | **Price**: $$ | **Neighborhood**: Roppongi
**ORDER**: The kurobuta pork tonkatsu. The dipping sauces. Perfectly fried pork cutlet.

## Tonkatsu Marugo
**Cuisine**: Tonkatsu | **Price**: $$ | **Neighborhood**: Uchisaiwaicho
**ORDER**: Their aged pork cutlet. One of Tokyo's most serious tonkatsu specialists.

## Kamachiku
**Cuisine**: Udon | **Price**: $$ | **Neighborhood**: Nezu
**ORDER**: Handmade udon in a beautiful historic wooden building. One of the most atmospheric udon restaurants in Tokyo.
**VIBE**: Old Tokyo neighborhood setting, tatami, garden.

## T's Tan Tan
**Cuisine**: Vegan ramen | **Price**: $ | **Neighborhood**: Tokyo Station
**ORDER**: The vegan dan dan noodles. Sesame-rich, spicy, deeply satisfying. The best vegan ramen in Japan.
**INSIDER**: Inside Tokyo Station — extremely convenient.

## Ichiran
**Cuisine**: Tonkotsu ramen (solo dining specialists) | **Price**: $ | **Multiple locations**
**ORDER**: The house tonkotsu ramen — you customize spice, noodle firmness, richness level on a printed form. Eat alone in a private booth.
**VIBE**: One of Japan's most unique dining concepts — private individual booths, solo dining encouraged, you communicate with staff through a bamboo curtain.
**BEST FOR**: The solo ramen experience. Late night after anything. Introduction to Japanese ramen culture.

## Afuri
**Cuisine**: Yuzu ramen | **Price**: $$ | **Multiple locations**
**ORDER**: The yuzu shio ramen — a delicate, citrus-bright broth that is the opposite of heavy tonkotsu. Perfect if you want something lighter.
**INSIDER**: Now also in the US (Portland), but the Tokyo original is still the benchmark.

## Midōsuji
(Same as Chicago note — different restaurant)

## Punch Room Tokyo
**Cuisine**: Cocktail bar | **Price**: $$$ | **Neighborhood**: Shinjuku / Edition Hotel
**ORDER**: Punches served tableside. The most theatrical cocktail experience in Tokyo.

## Bar Benfiddich
**Cuisine**: Cocktail bar | **Price**: $$$ | **Neighborhood**: Shinjuku
**ORDER**: Anything Hiroyasu Kayama makes. He forages his own botanicals and makes bitters, vermouths, and liqueurs from scratch. One of the world's great bartenders.
**VIBE**: Tiny bar, intimate, feels like being in an apothecary.

## Ode ⭐ (Michelin Star)
**Cuisine**: French-Japanese | **Price**: $$$$ | **Neighborhood**: Hiroo
**ORDER**: The tasting menu. One of Tokyo's most intimate and refined dining experiences.

## Shimizu
**Cuisine**: Traditional kaiseki | **Price**: $$$$ | **Neighborhood**: Ginza
**ORDER**: Full kaiseki. One of Ginza's most celebrated traditional Japanese restaurants.

## Crony
**Cuisine**: Contemporary French | **Price**: $$$$ | **Neighborhood**: Minami-Aoyama
**ORDER**: The chef's menu. A young, exciting French-trained chef cooking in Tokyo.

## Maz
**Cuisine**: Peruvian | **Price**: $$$$ | **Neighborhood**: Marunouchi
**Chef**: Virgilio Martínez (Central, Lima)
**ORDER**: The Peruvian tasting menu. A Tokyo outpost of one of the world's 50 best restaurants.

## Savoy
**Cuisine**: Neapolitan pizza | **Price**: $$ | **Neighborhood**: Azabu-Juban
**ORDER**: The margherita. One of the best Neapolitan pizza spots in Tokyo, which is saying something — Tokyo has some of the best Italian food outside Italy.

---

# 🇧🇦 BARCELONA

## El Celler de Can Roca ⭐⭐⭐ (Michelin 3-Star)
**Cuisine**: Catalan avant-garde | **Price**: $$$$ | **Neighborhood**: Girona (45 min from Barcelona)
**Chef**: The Roca Brothers (Joan, Josep, Jordi)
**ORDER**: The full tasting menu (~20 courses). Joan handles savory, Josep leads the wine (one of the world's greatest sommeliers), Jordi does dessert. The wine cellar tour is legendary.
**VIBE**: Elegant, joyful, deeply Spanish. Not austere — the Roca brothers want you to have fun.
**INSIDER**: Technically in Girona but included for being the Catalan region's apex restaurant. Reservations open January 1 for the year and sell out within days. Join the waiting list.
**CRED**: #1 World's 50 Best (twice). Michelin 3-star. Still the benchmark for Spanish fine dining.

## Disfrutar ⭐⭐⭐ (Michelin 3-Star)
**Cuisine**: Avant-garde Spanish | **Price**: $$$$ | **Neighborhood**: Eixample
**Chef**: Oriol Castro, Eduard Xatruch, Mateu Casañas (all ex-elBulli)
**ORDER**: The full tasting menu — these are three of Ferran Adrià's closest disciples. The most technically dazzling cooking in Barcelona proper.
**VIBE**: Playful, architectural, spectacular. The food looks like art and tastes like joy.
**CRED**: #2 World's 50 Best 2024. Michelin 3-star. The best restaurant in Barcelona city proper.

## Tickets
**Cuisine**: Creative tapas (Adrià family) | **Price**: $$$ | **Neighborhood**: Eixample / Poble Sec
**Chef**: Albert Adrià (Ferran Adrià's brother)
**ORDER**: The liquid olive (a spherified olive that explodes in your mouth — the iconic dish). The air baguette (impossibly light). The bikinis (melted cheese sandwiches). The pintxos counter.
**VIBE**: Circus meets tapas bar — colorful, theatrical, the most fun restaurant in Barcelona. Feels like dining inside a Miró painting.
**INSIDER**: Very difficult reservation — opens online weeks in advance. The adjacent bar Bodega 1900 (vermouth-focused) is easier to access.

## Alkimia ⭐⭐ (Michelin 2-Star)
**Cuisine**: Modern Catalan | **Price**: $$$$ | **Neighborhood**: Eixample
**Chef**: Jordi Vilà
**ORDER**: The Catalan tasting menu. Vilà is obsessed with Catalan tradition — every dish traces back to Catalonia's culinary heritage.

## Cocina Hermanos Torres ⭐⭐ (Michelin 2-Star)
**Cuisine**: Contemporary Spanish | **Price**: $$$$ | **Neighborhood**: Eixample
**Chef**: The Torres Brothers
**ORDER**: The full tasting menu in a spectacular greenhouse-like space.

## Enigma ⭐ (Michelin Star)
**Cuisine**: Creative Spanish | **Price**: $$$$ | **Neighborhood**: Eixample
**Chef**: Albert Adrià
**ORDER**: The 40-course tasting menu if you have 4 hours and want the most technically ambitious meal in the city.

## Cal Pep
**Cuisine**: Catalan tapas | **Price**: $$ | **Neighborhood**: El Born / Sant Pere
**ORDER**: The jamón croquetas. The garbanzos with blood sausage. The razor clams. Whatever Pep says to order.
**VIBE**: Counter-only (mostly), chaotic, lively, local. One of the most beloved casual restaurants in Barcelona.

## La Cova Fumada
**Cuisine**: Catalan / seafood | **Price**: $$ | **Neighborhood**: Barceloneta
**ORDER**: The bombas (potato-meat croquette in a thick sauce — allegedly invented here in the 1940s). The salt cod. Whatever's fresh from the market.
**VIBE**: Cash only, no reservations, closes when food runs out. A Barcelona legend.
**INSIDER**: Closes at lunchtime (usually by 2pm) and is closed weekends. One of the most authentic local dining experiences in the city.

## Bar del Pla
**Cuisine**: Catalan tapas | **Price**: $$ | **Neighborhood**: El Born / Sant Pere
**ORDER**: The croquetes de pernil (jamón croquettes — these are the ones). The boquerones. The vermut.
**VIBE**: Bright, buzzy, neighborhood energy in the middle of the Born. Locals and savvy visitors.

## Varmuteo
**Cuisine**: Vermouth bar | **Price**: $ | **Neighborhood**: Gràcia
**ORDER**: The house vermouth on ice with olives. The anchovies.
**VIBE**: Classic Barcelona vermouth culture. Sunday morning aperitivo ritual.

## Bar Marsella
**Cuisine**: Historic absinthe bar | **Price**: $ | **Neighborhood**: Barri Gòtic / El Raval
**ORDER**: The absinthe. They've been serving it since 1820.
**VIBE**: The oldest bar in Barcelona. Bottles covered in dust, Gaudí reportedly drank here. A time capsule.

## Mae
**Cuisine**: Wine bar / natural wine | **Price**: $$ | **Neighborhood**: El Born
**ORDER**: Natural wines by the glass. The small plates. Let the staff guide you.

## Teatro Kitchen & Bar
**Cuisine**: Contemporary Spanish | **Price**: $$$ | **Neighborhood**: El Born
**ORDER**: The seasonal creative menu. One of the city's more exciting contemporary Spanish kitchens.

## Entrepanes Díaz
**Cuisine**: Montaditos/sandwiches | **Price**: $ | **Neighborhood**: Eixample
**ORDER**: The montaditos — tiny open-faced sandwiches. The signature cured fish versions.

## Bodega Sepúlveda
**Cuisine**: Catalan wine bar | **Price**: $$ | **Neighborhood**: Eixample
**ORDER**: Vermouth. Whatever's on the chalkboard.

## Jiribilla
**Cuisine**: Cuban-Spanish fusion | **Price**: $$ | **Neighborhood**: El Born
**ORDER**: The rum drinks. The Cuban-influenced plates.

## Cervecería Catalana
**Cuisine**: Tapas | **Price**: $$ | **Neighborhood**: Eixample
**ORDER**: The patatas bravas. The croquetas. The jamón ibérico montadito.
**VIBE**: The prototypical Barcelona tapas bar. Always busy, reliably excellent.

---

# 🇩🇰 COPENHAGEN

## Noma ⭐⭐ (Michelin 2-Star) — NOW CLOSED AS RESTAURANT
**STATUS**: As of early 2024, Noma has closed as a restaurant and transitioned to Noma Projects (food lab). Confirm before visiting.
**INSIDER**: René Redzepi's announcement that Noma would close as a restaurant in 2024 sent shockwaves through the global food world. It spawned more restaurants, chefs, and ideas than perhaps any restaurant since elBulli. The "Noma Effect" is still reshaping global cuisine.

## Geranium ⭐⭐⭐ (Michelin 3-Star)
**Cuisine**: Nordic nature cuisine | **Price**: $$$$ | **Neighborhood**: Østerbro (National Stadium, 8th floor)
**Chef**: Rasmus Kofoed (gold medal, Bocuse d'Or)
**ORDER**: The full "Universe" tasting menu — 20+ courses of extraordinary Nordic technique. Views over Copenhagen's lakes. The most technically perfect restaurant in Scandinavia.
**VIBE**: Serene, architectural, deeply considered. Not as wild as Noma — more precise and contemplative.
**INSIDER**: Geranium stopped serving meat in 2022 — the entire menu is seafood and vegetables. Kofoed is the only chef to win gold, silver, and bronze at the Bocuse d'Or.
**CRED**: Michelin 3-star. #1 World's 50 Best 2022. Perennial top 5 globally.

## Kadeau Copenhagen ⭐ (Michelin Star)
**Cuisine**: Danish-Bornholm island | **Price**: $$$$ | **Neighborhood**: Islands Brygge
**ORDER**: The tasting menu inspired by ingredients from Bornholm island — berries, seafood, herbs foraged from the island's forests.
**VIBE**: Warm, intimate, island-in-the-city feeling. Very different energy from Geranium's precision.

## Alchemist ⭐⭐ (Michelin 2-Star)
**Cuisine**: Holistic cuisine / theatrical avant-garde | **Price**: $$$$ | **Neighborhood**: Refshaleøen
**Chef**: Rasmus Munk
**ORDER**: The 50-course "holistic cuisine" experience — you dine in a 270° dome with projections, then move through themed rooms. Dishes comment on society, sustainability, mental health.
**VIBE**: The most theatrical restaurant in the world, possibly in history. A 4-5 hour event, not just a meal.
**INSIDER**: The venue includes an art gallery, a cocktail lounge, and multiple themed rooms. Controversial among serious food critics but an undeniable experience.
**CRED**: Michelin 2-star. Top 10 World's 50 Best.

## Jordnær ⭐⭐ (Michelin 2-Star)
**Cuisine**: French-Nordic | **Price**: $$$$ | **Neighborhood**: Gentofte (north of Copenhagen)
**Chef**: Eric Vildgaard
**ORDER**: The tasting menu. Vildgaard focuses intensely on caviar, truffles, and seasonal Danish ingredients with French technique.

## Kong Hans Kælder ⭐ (Michelin Star)
**Cuisine**: Classic French-Danish | **Price**: $$$$ | **Neighborhood**: Old Town / Gammel Strand
**ORDER**: The classic menu in Copenhagen's oldest restaurant. Gothic vaulted cellar, white tablecloths, candlelight. The opposite of the new Nordic wave.
**VIBE**: Medieval cellar that has fed Danish royalty since 1976.

## AOC ⭐⭐ (Michelin 2-Star)
**Cuisine**: New Nordic | **Price**: $$$$ | **Neighborhood**: Old Town / Kongens Nytorv
**Chef**: Søren Selin
**ORDER**: Seasonal Nordic tasting menu. More accessible than Geranium, equally serious.

## Kødbyens Fiskebar ⭐ (Michelin Bib)
**Cuisine**: Seafood | **Price**: $$-$$$ | **Neighborhood**: Meatpacking District / Kødbyen
**ORDER**: The whole fish. The oysters. The classic fish and chips. The scallops.
**VIBE**: Relaxed seafood restaurant in the trendy Meatpacking District. One of Copenhagen's most reliably great and accessible spots.

## Koan ⭐⭐ (Michelin 2-Star)
**Cuisine**: Korean-Nordic fusion | **Price**: $$$$ | **Neighborhood**: Frederiksberg
**Chef**: Kristian Baumann (ex-Noma)
**ORDER**: The tasting menu — a genuine, creative synthesis of Korean flavor profiles with Nordic ingredients.

## Høst ⭐ (Michelin Star)
**Cuisine**: Modern Nordic | **Price**: $$$ | **Neighborhood**: Nørreport
**ORDER**: The seasonal Nordic set menu. Beautiful interior with reclaimed wood and hanging botanicals.
**VIBE**: One of Copenhagen's most photogenic dining rooms.

## Marv & Ben
**Cuisine**: Modern Nordic bistro | **Price**: $$$ | **Neighborhood**: Gammel Strand
**ORDER**: The two-course or three-course à la carte menu. One of Copenhagen's best neighborhood restaurants.

## Smørrebrød at Schønnemann
**Cuisine**: Traditional Danish smørrebrød | **Price**: $$ | **Neighborhood**: Hauser Plads
**ORDER**: The open-faced rye bread sandwiches with herring (sild), roast beef with remoulade, smoked eel, liver pâté. The aquavit selection.
**VIBE**: The best smørrebrød restaurant in Copenhagen, dating to 1877.
**INSIDER**: Closed evenings. Lunch only. Cash preferred.

## Lille Bakery
**Cuisine**: Danish bakery | **Price**: $ | **Neighborhood**: Islands Brygge
**ORDER**: The sourdough. The cardamom buns. The seasonal pastries.
**VIBE**: One of Copenhagen's most beloved bakeries. Queue up.

## Nørrebro Bryghus
**Cuisine**: Danish craft beer / pub food | **Price**: $$ | **Neighborhood**: Nørrebro
**ORDER**: The house-brewed beers on tap. The Danish pub food.
**VIBE**: Beloved neighborhood brewery in multicultural Nørrebro.

## Ark
**Cuisine**: Natural wine bar | **Price**: $$ | **Neighborhood**: Vesterbro
**ORDER**: Natural wines, small plates. Part of Copenhagen's thriving natural wine scene.

---

# 🌊 SAN DIEGO

## Addison ⭐⭐ (Michelin 2-Star)
**Cuisine**: French-California tasting menu | **Price**: $$$$ | **Neighborhood**: Del Mar / North County
**Chef**: William Bradley
**ORDER**: The full tasting menu — the most technically refined restaurant in San Diego. Bradley has been here for nearly 20 years, refining his style.
**VIBE**: Country club elegance, but warmer. Garden setting, impeccable service.
**CRED**: California's first 2-star Michelin restaurant when stars came to CA.

## Jeune et Jolie ⭐ (Michelin Star)
**Cuisine**: French-California | **Price**: $$$ | **Neighborhood**: Carlsbad
**Chef**: Eric Bost
**ORDER**: The à la carte French menu — one of the most romantic dining rooms in Southern California.

## Juniper & Ivy
**Cuisine**: California-American | **Price**: $$$ | **Neighborhood**: Little Italy
**Chef**: Anthony Sinsay (originally Richard Blais)
**ORDER**: The wood-fired dishes. The creative California menu.
**VIBE**: A cool, casual-upscale Little Italy spot in a converted warehouse.

## Callie
**Cuisine**: Eastern Mediterranean | **Price**: $$$ | **Neighborhood**: East Village
**ORDER**: The mezze plates. The wood-fired flatbread. The whole roasted fish.
**VIBE**: One of San Diego's most exciting newer restaurants.

## Ironside Fish & Oyster
**Cuisine**: Seafood | **Price**: $$$ | **Neighborhood**: Little Italy
**ORDER**: The oysters. The fish and chips. The lobster roll.
**VIBE**: Classic San Diego seafood restaurant in a ship-themed room. Great happy hour oyster deals.

## Herb & Wood
**Cuisine**: California-Italian | **Price**: $$$ | **Neighborhood**: Little Italy
**ORDER**: The wood-fired pizza. The pasta. Whatever is coming off the grill.

## Campfire ⭐ (Michelin Bib)
**Cuisine**: American campfire cooking | **Price**: $$$ | **Neighborhood**: Carlsbad
**ORDER**: The wood-fired dishes. The smoked meats. The campfire cocktails.
**VIBE**: Sophisticated campfire aesthetic — bonfire-scented, cozy, outdoorsy.

## Tribute Pizza
**Cuisine**: Detroit-style pizza | **Price**: $$ | **Neighborhood**: North Park
**ORDER**: The Detroit-style square. Crispy cheese edges, brick-like crust, sauce on top. One of San Diego's most beloved pizza destinations.

## Cori Pastificio Trattoria
**Cuisine**: Italian pasta | **Price**: $$$ | **Neighborhood**: Mission Hills
**ORDER**: The handmade pasta. The carbonara. Everything is made fresh daily.

## Azuki
**Cuisine**: Japanese / sushi | **Price**: $$-$$$ | **Neighborhood**: Bankers Hill
**ORDER**: The omakase or the à la carte sushi.

## Fish Guts
**Cuisine**: Seafood / bistronomie | **Price**: $$$ | **Neighborhood**: North Park
**ORDER**: The market fish. The creative small plates.
**VIBE**: One of San Diego's most exciting neighborhood bistros.

## Mabel's Gone Fishing
**Cuisine**: Seafood | **Price**: $$$ | **Neighborhood**: Bankers Hill
**ORDER**: The oysters. The daily fish specials. The whole roasted shellfish.

## Wolf In The Woods
**Cuisine**: American | **Price**: $$$ | **Neighborhood**: Rancho Santa Fe
**ORDER**: The wood-fired dishes. The seasonal California menu.

## Kettner Exchange
**Cuisine**: American | **Price**: $$$ | **Neighborhood**: Little Italy
**ORDER**: The cocktails. The seasonal menu. The rooftop views.
**VIBE**: Rooftop bar and restaurant with some of San Diego's best views.

## El Jardín
**Cuisine**: Mexican (creative) | **Price**: $$$ | **Neighborhood**: Liberty Station
**ORDER**: The aguachile. The tacos. The beautiful cocktails in the garden.
**VIBE**: A stunning garden setting for creative Mexican cooking. One of SD's most beautiful restaurants.

## Cellar Hand
**Cuisine**: Wine bar / natural wine | **Price**: $$ | **Neighborhood**: North Park
**ORDER**: Natural wines by the glass. The food pairings.
**VIBE**: North Park's best natural wine bar. The wine community's gathering place.

---

# 🌮 AUSTIN

## Franklin Barbecue
**Cuisine**: Texas BBQ | **Price**: $ | **Neighborhood**: East Austin
**Chef/Pitmaster**: Aaron Franklin (James Beard)
**ORDER**: The brisket — the benchmark for smoked brisket in America. The ribs. The turkey. Arrive by 8am or the best cuts will be gone by noon.
**VIBE**: Queue from before dawn, eat at picnic tables, finished by 2pm (when it sells out). A pilgrimage.
**INSIDER**: Aaron Franklin won the James Beard Award for Outstanding Chef — the first BBQ pitmaster to win the top national award. The brisket has a smoke ring that looks like it was painted on.
**CRED**: James Beard Outstanding Chef. Considered the best BBQ in Texas.

## Interstellar BBQ
**Cuisine**: Texas BBQ | **Price**: $ | **Neighborhood**: Cedar Park / North Austin
**ORDER**: The brisket. The jalapeño-cheddar sausage. The turkey. Often considered the "local secret" answer to Franklin's.
**INSIDER**: Shorter lines than Franklin. Many Austin locals say it's as good or better.

## La Barbecue
**Cuisine**: Texas BBQ | **Price**: $ | **Neighborhood**: East Austin
**ORDER**: The beef ribs — massive, smoky, Flintstones-size ribs. The brisket.
**VIBE**: Casual trailer-park setting. One of Franklin's most acclaimed rivals.

## Uchi
**Cuisine**: Japanese-Texas fusion | **Price**: $$$ | **Neighborhood**: South Lamar
**Chef**: Tyson Cole (James Beard Best Chef Southwest)
**ORDER**: The tasmanian ocean trout sashimi. The jar of beets (it's not what it sounds like). The machi cure. The house-made tofu. The sake flights.
**VIBE**: The restaurant that put Austin on the national fine dining map. Still the city's finest Japanese-influenced restaurant.
**CRED**: James Beard Best Chef Southwest (Cole).

## Emmer & Rye
**Cuisine**: American (fermentation-focused) | **Price**: $$$ | **Neighborhood**: Rainey Street
**Chef**: Kevin Fink
**ORDER**: The dim-sum style service — servers come to the table with small plates all night. The fermented vegetable dishes. The heritage grain breads.
**VIBE**: Rainey Street location, open kitchen with a dim-sum cart circulating. One of Austin's most creative restaurants.

## Odd Duck
**Cuisine**: American (farm-focused, sharing plates) | **Price**: $$ | **Neighborhood**: South Lamar
**ORDER**: The seasonal small plates — everything changes based on what Travis County farms are growing. Share 4-5 plates per person.
**VIBE**: Austin's best farm-to-table restaurant. Warm, unpretentious, reliably excellent.

## Veracruz All Natural
**Cuisine**: Mexican | **Price**: $ | **Neighborhood**: Multiple locations / East Austin
**ORDER**: The migas tacos. The breakfast tacos. The agua frescas.
**VIBE**: Austin's most-loved breakfast taco truck. Part of Austin's taco culture.

---

# 🎸 NASHVILLE

## Prince's Hot Chicken
**Cuisine**: Nashville Hot Chicken | **Price**: $ | **Neighborhood**: Multiple
**ORDER**: The hot chicken (specify your heat level — Medium is already intense, Extra Hot is a challenge). On white bread with a pickle.
**VIBE**: The original, the institution. Cash only, paper plates, picnic tables. A Nashville civic religion.
**INSIDER**: Andre Prince Jeffries runs this — the family has been making this since the 1930s when the recipe was allegedly invented to punish an unfaithful lover. The dish is now global.

## The Catbird Seat
**Cuisine**: Contemporary American tasting menu | **Price**: $$$$ | **Neighborhood**: Midtown
**ORDER**: The tasting menu — counter seating around an open kitchen, 10-ish intimate courses.
**VIBE**: Nashville's best fine dining, intimate and technically precise.

## Husk Nashville
**Cuisine**: Southern American | **Price**: $$$ | **Neighborhood**: Midtown
**Chef**: Sean Brock's inspiration (now run by successors)
**ORDER**: The cast iron cornbread. The fried chicken. The seasonal Southern vegetables.
**VIBE**: Antebellum house, beautiful porch dining. Southern cooking taken seriously.

## Rolf & Daughters ⭐ (Michelin Bib)
**Cuisine**: European | **Price**: $$$ | **Neighborhood**: Germantown
**ORDER**: The pasta. The wood-roasted vegetables. The simple, perfect Euro bistro fare.
**VIBE**: Nashville's most romantic dinner. Converted textile building, candlelit.

## Arnold's Country Kitchen
**Cuisine**: Southern meat-and-three | **Price**: $ | **Neighborhood**: Rolling Mill Hill
**ORDER**: The meat of the day (roast beef, fried chicken). Two or three sides — whatever looks best. The cornbread. The banana pudding.
**VIBE**: A true Nashville meat-and-three. Cafeteria line, paper plates. The most authentic Southern lunch in the city.
**INSIDER**: Open only for lunch, closes when food runs out. Get there before noon.

## Butchertown Hall
**Cuisine**: Tex-Mex / BBQ | **Price**: $$ | **Neighborhood**: Germantown
**ORDER**: The smoked brisket tacos. The enchiladas. The margaritas.

---

# 🇲🇽 MEXICO CITY

## Pujol ⭐ (Michelin Star)
**Cuisine**: Contemporary Mexican | **Price**: $$$$ | **Neighborhood**: Polanco
**Chef**: Enrique Olvera
**ORDER**: The Taco Omakase counter (10-course taco tasting menu) OR the full tasting menu. The Mole Madre — a mole that has been cooking for years, with a fresh new mole placed in the center creating a flavor contrast. The elote with mayonnaise, coffee, and chicatana ant chili. The corn tortillas with hoja santa.
**VIBE**: The most important restaurant in Mexico. Calm, precise, the reference point for all modern Mexican fine dining.
**INSIDER**: The Mole Madre is one of the most famous dishes in the world — the outer ring can be 1,000+ days old. The corn tasting counter is also exceptional.
**CRED**: World's 50 Best perennial. Launched the modern Mexican fine dining movement globally.

## Quintonil ⭐ (Michelin Star)
**Cuisine**: Contemporary Mexican vegetables and seafood | **Price**: $$$$ | **Neighborhood**: Polanco
**Chef**: Jorge Vallejo
**ORDER**: The tasting menu. Vallejo focuses on Mexico's indigenous ingredients — hoja santa, hierba santa, insects, underused vegetables. The escamoles (ant larvae) if in season.
**VIBE**: Warmer and more feminine than Pujol. Organic, vegetable-focused.
**CRED**: World's 50 Best. The leading young chef of Mexico City's restaurant scene.

## Contramar
**Cuisine**: Seafood | **Price**: $$$ | **Neighborhood**: Colonia Roma
**ORDER**: The atún rojo — a whole tuna filet, half painted with red chile sauce, half with green parsley sauce, grilled. The tostadas de atún. The agua de Jamaica. The mezcal.
**VIBE**: The best lunch in Mexico City. Open noon to 6pm only, packed with Mexico City's creative class, politicians, and artists.
**INSIDER**: The atún rojo is the most iconic dish in CDMX casual dining. Book a reservation — it's very popular. You'll see the same person at the next table every week because it's that kind of place.
**BEST FOR**: The quintessential Mexico City long lunch experience.

## Maximo Bistrot
**Cuisine**: Mexican-French bistronomie | **Price**: $$$ | **Neighborhood**: Colonia Roma
**Chef**: Eduardo Garcia
**ORDER**: The daily market menu — Garcia writes the menu each morning based on what's at the market. The burrata. The sea bass. The whole roasted meats.
**VIBE**: The neighborhood bistro that defines Roma Norte's restaurant culture. Warm and unpretentious.

## El Hidalguense
**Cuisine**: Hidalguense barbacoa | **Price**: $ | **Neighborhood**: Colonia Roma / Doctores
**ORDER**: The lamb barbacoa — slow-cooked overnight in underground pits, served on weekends only. With consommé, green salsa, and tortillas.
**VIBE**: Weekend-only tradition. Come early (they run out by 2pm). Cash only, plastic chairs.
**INSIDER**: One of the most culturally significant meals in Mexico City. Not fancy — authentic.

## Los Cocuyos
**Cuisine**: Late-night tacos | **Price**: $ | **Neighborhood**: Centro Histórico
**ORDER**: The tacos de suadero (braised beef brisket). The tacos de longaniza. Come after midnight.
**VIBE**: The most famous late-night taco stand in Mexico City. Open 24 hours. A pilgrimage for night owls.

---

# 🇬🇧 LONDON

## St. John ⭐ (Michelin Bib)
**Cuisine**: British nose-to-tail | **Price**: $$$ | **Neighborhood**: Smithfield / Clerkenwell
**Chef**: Fergus Henderson
**ORDER**: The roast bone marrow and parsley salad — the most influential British dish of the past 30 years. Whatever offal dish is on — Fergus Henderson invented the modern nose-to-tail movement. The eccles cake with Lancashire cheese. The Madeleines.
**VIBE**: Converted Victorian smokehouse, white walls, spartan beauty. Zero fussiness. Pure food.
**INSIDER**: Henderson's cooking launched a thousand restaurants — the entire snout-to-tail movement traces to this room. The bakery next door (St. John Bread & Wine) is equally essential.
**CRED**: Time Out 50 Most Influential Restaurants of All Time. James Beard. Fergus Henderson won a special James Beard for inventing nose-to-tail dining.

## Dishoom
**Cuisine**: Bombay café / Indian | **Price**: $$ | **Neighborhood**: Multiple (Covent Garden, King's Cross, Shoreditch, Edinburgh)
**ORDER**: The bacon naan roll (breakfast). The black dal (the dal that takes 24 hours — the best in London). The house black pepper chicken. The chai.
**VIBE**: Beautiful recreation of Bombay's Irani café culture — a pre-Partition India you can sense in the tiled floors, dark wood, and vintage fans. London's most beloved Indian restaurant.
**INSIDER**: The queues can be 1-2 hours for walk-ins. Book online if you can. The Covent Garden branch stays open until midnight.
**BEST FOR**: Long breakfasts. The black dal is non-negotiable.

## Brat ⭐⭐ (Michelin 2-Star)
**Cuisine**: Basque-inspired fire cooking | **Price**: $$$ | **Neighborhood**: Shoreditch
**Chef**: Tomos Parry
**ORDER**: The whole turbot cooked over wood — the defining dish of modern London. The txakoli chicken. The anchovy toast. Whatever is coming off the grill.
**VIBE**: Casual, noisy, exhilarating. Named after the Old English word for turbot. Parry is Welsh but cooks with Basque technique and obsession.
**INSIDER**: Turbot is famously expensive but Parry uses a whole fish, making it remarkable value. The rooftop restaurant (Brat on the Roof) in summer is one of London's best outdoor dining experiences.
**CRED**: Michelin 2-star. Time Out Best London Restaurant. Guardian's Restaurant of the Year.

## The Clove Club ⭐⭐ (Michelin 2-Star)
**Cuisine**: British fine dining | **Price**: $$$$ | **Neighborhood**: Shoreditch / Hoxton
**Chef**: Isaac McHale
**ORDER**: The tasting menu — McHale's food is intensely seasonal, technically pristine, and proudly British. The buttermilk fried chicken and pine salt (a famous amuse-bouche). Whatever heritage variety potato is being served.
**VIBE**: Beautiful room in Shoreditch Town Hall. One of London's best tasting menus.
**CRED**: Michelin 2-star. World's 50 Best regular.

## Rochelle Canteen
**Cuisine**: British | **Price**: $$ | **Neighborhood**: Shoreditch / Arnold Circus
**Chef**: Margot Henderson (Fergus's wife)
**ORDER**: Whatever the chalkboard lunch menu says — the menu changes daily based on what's at the market. The roast potatoes. The seasonal vegetables.
**VIBE**: Hidden in a former bike shed behind a gate in a schoolyard. Picnic tables, no signs, the most charming lunch spot in London. Daytime only (mostly).

## Kiln ⭐ (Michelin Bib)
**Cuisine**: Northern Thai / Burmese | **Price**: $$ | **Neighborhood**: Soho
**ORDER**: The clay pot baked crab with glass noodles. The Chiang Rai pork skewers. The Shan-style noodles. Whatever is coming out of the clay pots and wood-fire grill.
**VIBE**: Counter seating, open kitchen, smoky and loud. The best Thai cooking in London.
**INSIDER**: No reservations, queues form fast. Come early or very late. The smoky clay-pot dishes are why you're there.
**CRED**: Time Out Best London. Michelin Bib Gourmand.

---

# 🇦🇪 DUBAI

## Tresìnd Studio ⭐⭐ (Michelin 2-Star / World's 50 Best)
**Cuisine**: Modern Indian tasting menu | **Price**: $$$$ | **Neighborhood**: Wafi Pyramid area
**Chef**: Himanshu Saini
**ORDER**: The "Heritage India" tasting menu — Saini deconstructs and reimagines Indian regional cuisines with extraordinary technique. The pani puri course. The mango dessert. The dal reimagined.
**VIBE**: The most prestigious Indian tasting menu in the world right now. Intimate, theatrical, stunning.
**CRED**: Michelin 2-star. World's 50 Best. #1 in Middle East & North Africa's 50 Best.

## Ossiano ⭐ (Michelin Star)
**Cuisine**: Contemporary seafood | **Price**: $$$$ | **Neighborhood**: Atlantis, The Palm
**Chef**: Grégoire Berger
**ORDER**: The tasting menu overlooking a massive aquarium wall. The seafood is extraordinary.
**VIBE**: Dining inside a giant aquarium. One of the most visually stunning restaurants in the world.

## 3 Fils
**Cuisine**: Contemporary Asian | **Price**: $$$ | **Neighborhood**: Jumeirah Fishing Harbour
**ORDER**: The crispy rice with spicy tuna. The yellowtail jalapeño. The creative Asian fusion small plates.
**VIBE**: Casual, waterfront, the spot that started Dubai's neo-bistro movement.
**INSIDER**: The most booked restaurant in Dubai among the food-savvy crowd. No reservations — walk-in only.

## Folly by Nick & Scott
**Cuisine**: British-international | **Price**: $$$ | **Neighborhood**: DIFC
**ORDER**: The seasonal British-inspired menu. One of Dubai's most interesting non-hotel restaurants.

## Dinner by Heston Blumenthal ⭐ (Michelin Star)
**Cuisine**: Historic British | **Price**: $$$$ | **Neighborhood**: Atlantis, The Royal
**ORDER**: The meat fruit (mandarin-shaped chicken liver parfait — a recreation of a medieval dish). The tipsy cake. The tasting menu.
**VIBE**: Heston Blumenthal's historical British cooking in Dubai's most spectacular new hotel.

## Tasca by José Avillez ⭐ (Michelin Star)
**Cuisine**: Modern Portuguese | **Price**: $$$$ | **Neighborhood**: Mandarin Oriental Jumeirah
**Chef**: José Avillez (2-star from Lisbon)
**ORDER**: The cured bacalhau. The Alentejo black pork. The pastel de nata.

## Nobu Dubai
**Cuisine**: Japanese-Peruvian | **Price**: $$$$ | **Neighborhood**: Atlantis, The Palm
**ORDER**: The black cod miso. The yellowtail jalapeño. The rock shrimp tempura.
**VIBE**: The Atlantis flagship Nobu. Spectacular setting.

## Zuma Dubai
**Cuisine**: Izakaya Japanese | **Price**: $$$$ | **Neighborhood**: DIFC
**ORDER**: The black cod with barley miso. The sashimi platter. The wagyu beef skewers.
**VIBE**: One of the world's most glamorous restaurant chains, and the Dubai outpost is among the best.

## Gaia Dubai ⭐ (Michelin Star)
**Cuisine**: Greek | **Price**: $$$$ | **Neighborhood**: DIFC
**ORDER**: The fresh seafood. The mezze. The Greek wines.
**VIBE**: Upscale Greek in Dubai's financial district. One of the best Greek restaurants outside Greece.

## Amazonico Dubai
**Cuisine**: Latin American / Brazilian | **Price**: $$$$ | **Neighborhood**: DIFC
**ORDER**: The caipirinhas. The whole fish. The tropical cocktails.
**VIBE**: A jungle-themed experience restaurant. Theatrical, over-the-top, very Dubai.

## Nusr-Et Dubai (Salt Bae)
**Cuisine**: Steakhouse | **Price**: $$$$$+ | **Neighborhood**: Multiple
**ORDER**: The tomahawk wagyu. The gold-wrapped meats if you need the Instagram.
**VIBE**: Pure spectacle. Nusret Gökçe (Salt Bae) of viral fame. Extremely expensive.
**INSIDER**: Generally considered more show than substance by serious food people, but undeniably an experience.

## Pierchic ⭐ (Michelin Bib)
**Cuisine**: Italian seafood | **Price**: $$$$ | **Neighborhood**: Al Qasr Hotel, Jumeirah Beach
**ORDER**: The fresh pasta. The seafood. The sunset view over the Arabian Gulf.
**VIBE**: At the end of a pier over the water, directly facing the Burj Al Arab. One of the most beautiful restaurant settings in the world.

## Coya Dubai
**Cuisine**: Peruvian | **Price**: $$$$ | **Neighborhood**: DIFC
**ORDER**: The ceviche. The tiradito. The pisco sours. The anticuchos.
**VIBE**: Upscale Peruvian with DJs and a nightclub energy.

---

# 🇵🇹 LISBON

## Belcanto ⭐⭐ (Michelin 2-Star)
**Cuisine**: Contemporary Portuguese | **Price**: $$$$ | **Neighborhood**: Chiado
**Chef**: José Avillez
**ORDER**: The tasting menu — Avillez reinterprets classic Portuguese dishes through a fine dining lens. The caldo verde reimagined. The salted cod in its many forms.
**VIBE**: The most elegant room in Lisbon. White tablecloths, beautiful service.
**CRED**: World's 50 Best regular. Portugal's most celebrated restaurant.

## Cervejaria Ramiro
**Cuisine**: Seafood / marisqueira | **Price**: $$$ | **Neighborhood**: Intendente
**ORDER**: Percebes (goose barnacles) — the most distinctive Portuguese seafood. Gambas a la plancha (grilled shrimp). The clams. The piri piri tiger prawns. Finish with a prego sandwich (steak sandwich in a bread roll) — this is mandatory.
**VIBE**: Loud, packed, standing room only. Neon lights, plastic tables, everyone eating the same things. The most beloved seafood restaurant in Lisbon.
**INSIDER**: The prego at the end — you eat it as your carb/sweet finale. No reservations for the restaurant (only the upstairs). Come at lunch to avoid the worst queues.

## Time Out Market
**Cuisine**: Food hall | **Price**: $ | **Neighborhood**: Cais do Sodré
**ORDER**: Whatever you want from the stalls — select the highest-rated restaurants in Lisbon and get their dishes at market prices. Great for a first-night overview of Portuguese food.
**INSIDER**: The concept originated here and has since been copied worldwide. The original is still the best.

## A Cevicheria
**Cuisine**: Peruvian/Mediterranean | **Price**: $$$ | **Neighborhood**: Príncipe Real
**ORDER**: The ceviche of the day. The leche de tigre. The octopus.
**VIBE**: Cool Príncipe Real neighborhood spot with a giant stuffed octopus hanging from the ceiling. One of Lisbon's most popular restaurants.

## Tasca do Chico
**Cuisine**: Portuguese fado restaurant | **Price**: $$ | **Neighborhood**: Madragoa
**ORDER**: The pork cheeks. The bacalhau. The wine list. The fado performance.
**VIBE**: One of the best places in Lisbon to experience authentic fado music with great food. Intimate, emotional, essentially Portuguese.

## Solar dos Presuntos
**Cuisine**: Traditional Portuguese | **Price**: $$$ | **Neighborhood**: Avenida
**ORDER**: The presuntos (cured ham). The caldo verde. The bacalhau com broa.
**VIBE**: A Lisbon institution that has preserved traditional Portuguese cooking.

---

# 🇰🇷 SEOUL

## Mingles ⭐⭐ (Michelin 2-Star)
**Cuisine**: Modern Korean | **Price**: $$$$ | **Neighborhood**: Gangnam
**Chef**: Mingoo Kang
**ORDER**: The tasting menu — Kang trained at elBulli and brings Spanish technical precision to Korean ingredients. The makgeolli (Korean rice wine) paired dishes are remarkable.
**VIBE**: The most important modern Korean tasting menu in Seoul.
**CRED**: Asia's 50 Best regular. World's 50 Best.

## Jungsik ⭐⭐ (Michelin 2-Star)
**Cuisine**: New Korean | **Price**: $$$$ | **Neighborhood**: Gangnam
**Chef**: Jungsik Yim
**ORDER**: The tasting menu reimagining Korean temple food and royal court cuisine through a modern lens. The kimchi dish.
**CRED**: Michelin 2-star Seoul and New York (both locations). The chef who brought modern Korean dining to international consciousness.

## Gwangjang Market
**Cuisine**: Traditional Korean market food | **Price**: $ | **Neighborhood**: Jongno
**ORDER**: Bindaetteok (mung bean pancakes, the specialty of the market). Mayak gimbap (tiny rice rolls, "narcotic" gimbap). Yukhoe (Korean beef tartare). The makgeolli.
**VIBE**: One of Korea's oldest and largest traditional markets. Cramped stalls, grandmothers cooking, the smell of sesame and doenjang.
**BEST FOR**: The most authentic market food experience in Seoul. Anthony Bourdain ate here.

## Maple Tree House
**Cuisine**: Korean BBQ (premium) | **Price**: $$$$ | **Neighborhood**: Itaewon / Hannam-dong
**ORDER**: The wagyu and domestic hanwoo beef. The galbi. The ssamjang. Cook at the table.
**VIBE**: Upscale Korean BBQ in a beautiful setting. The glamour BBQ experience.

## Tosokchon Samgyetang
**Cuisine**: Korean ginseng chicken soup | **Price**: $$ | **Neighborhood**: Gyeongbokgung / Chebu-dong
**ORDER**: The samgyetang — a whole young chicken stuffed with sticky rice, ginseng, jujube, and garlic, slow-simmered in a broth that feels medicinal.
**VIBE**: Traditional house, garden, elderly women carrying clay pots. A Seoul institution since the 1970s.
**INSIDER**: People eat this in the heat of summer (the hottest three weeks, called Sambok) — the Korean belief is that eating hot soup fights heat with heat (以熱治熱). Lines form early.

## Neurin Maeul
**Cuisine**: Korean (slow cooking) | **Price**: $$ | **Neighborhood**: Various
**ORDER**: The slow-cooked pork. The doenjang jjigae. The banchan spread.
**VIBE**: Traditional Korean home cooking, slow and careful.

---

# 🌮 DALLAS

## Lucia
**Cuisine**: Italian (seasonal) | **Price**: $$$ | **Neighborhood**: Oak Cliff / Bishop Arts
**Chef**: David Uygur
**ORDER**: The pasta — Uygur changes the menu completely based on what's available. Everything house-made. The salumi program.
**VIBE**: Oak Cliff neighborhood gem. Small, intimate, the best Italian in Dallas.

## Mister Charles
**Cuisine**: Contemporary American | **Price**: $$$ | **Neighborhood**: Knox-Henderson
**ORDER**: The seasonal menu. One of Dallas's most exciting newer restaurants.

## Cattleack Barbecue
**Cuisine**: Texas BBQ | **Price**: $ | **Neighborhood**: Farmers Branch (North Dallas)
**ORDER**: The brisket — has been rated among the top 5 BBQ spots in Texas by Texas Monthly. The jalapeño-cheddar sausage.
**INSIDER**: Open Thursday and Friday only. Cash strongly preferred. Lines start before opening.
**CRED**: Texas Monthly's 50 Best BBQ list.

## Khao Noodle Shop
**Cuisine**: Lao noodles | **Price**: $ | **Neighborhood**: Lowest Greenville
**ORDER**: The khao soi. The nam khao. The pho-adjacent Lao noodle soups.
**VIBE**: One of the most exciting Lao restaurants in the country. Tiny room, serious food.

## Nonna Dallas
**Cuisine**: Italian (neighborhood) | **Price**: $$ | **Neighborhood**: Henderson Avenue
**ORDER**: The pizza. The pasta. The tiramisu.
**VIBE**: The Dallas neighborhood Italian that everyone has a soft spot for.

## Le Bilboquet Dallas
**Cuisine**: French brasserie | **Price**: $$$$ | **Neighborhood**: Highland Park
**ORDER**: The steak frites. The French onion soup. The whole fish.
**VIBE**: The polished French brasserie for Highland Park's money crowd.

## Beverley's
**Cuisine**: American | **Price**: $$$ | **Neighborhood**: Oak Cliff
**ORDER**: The cocktails. The seasonal menu.
**VIBE**: Oak Cliff cool. One of Dallas's most interesting bars turned restaurants.

## Farina in Grani
**Cuisine**: Italian pizza / pasta | **Price**: $$ | **Neighborhood**: Knox-Henderson
**ORDER**: The Neapolitan pizza. The handmade pasta.

## Muchacho
**Cuisine**: Mexican-American | **Price**: $$ | **Neighborhood**: Design District
**ORDER**: The tacos. The margaritas. The creative Mexican-American menu.

## Bar Colette
**Cuisine**: French wine bar | **Price**: $$ | **Neighborhood**: Knox-Henderson
**ORDER**: Natural wines. The small plates.

## Easy Slider
**Cuisine**: Sliders | **Price**: $ | **Neighborhood**: Multiple
**ORDER**: The beef sliders. Simple, delicious.

## Rye
**Cuisine**: American | **Price**: $$$ | **Neighborhood**: Henderson Avenue
**ORDER**: The seasonal menu.

## Gemma
**Cuisine**: Contemporary Italian | **Price**: $$$ | **Neighborhood**: Henderson Avenue
**ORDER**: The pasta. The whole roasted fish. The bread.

## Sunny's
**Cuisine**: Wine bar / American | **Price**: $$ | **Neighborhood**: Bishop Arts
**ORDER**: Natural wines. Small plates. One of Dallas's best wine bars.

## Resident Taqueria
**Cuisine**: Tacos | **Price**: $ | **Neighborhood**: Knox-Henderson
**ORDER**: Birria tacos. Creative taco format.

## Georgie by Curtis Stone
**Cuisine**: Australian-American steakhouse | **Price**: $$$$ | **Neighborhood**: Dallas CBD
**ORDER**: The prime beef. Curtis Stone's LA-Australian aesthetic applied to Texas beef.

## Otaka's
**Cuisine**: Japanese (omakase) | **Price**: $$$$ | **Neighborhood**: Uptown
**ORDER**: The omakase. Dallas's best sushi counter.

---

# 🇦🇪 DALLAS ADDITIONAL

## Pillar
**Cuisine**: Contemporary American | **Price**: $$$ | **Neighborhood**: Dallas
**ORDER**: The seasonal tasting menu.

## Written by the Seasons
**Cuisine**: Japanese-French fusion | **Price**: $$$$ | **Neighborhood**: Dallas
**ORDER**: The tasting menu. The most technically ambitious restaurant in Dallas.

## Mot Hai Ba
**Cuisine**: Vietnamese | **Price**: $$ | **Neighborhood**: Dallas
**ORDER**: The modern Vietnamese small plates. The banh mi.

## Kafi BBQ
**Cuisine**: BBQ | **Price**: $ | **Neighborhood**: Dallas
**ORDER**: The brisket. A newer challenger in the Dallas BBQ scene.

## Recoveco
**Cuisine**: Spanish | **Price**: $$$ | **Neighborhood**: Dallas
**ORDER**: The tapas. The wine list.

## Tâm Tâm
**Cuisine**: Vietnamese | **Price**: $$ | **Neighborhood**: Dallas
**ORDER**: Banh mi, pho, modern Vietnamese.

## Cotoa
**Cuisine**: Colombian | **Price**: $$ | **Neighborhood**: Dallas
**ORDER**: The Colombian classics. Arepas, bandeja paisa.

---

# 🌊 MIAMI (ADDITIONAL — BATCH 5)

## Claudie
**Cuisine**: Contemporary French | **Price**: $$$$ | **Neighborhood**: Surfside
**ORDER**: The seasonal menu. French-inflected with Florida ingredients.

## ViceVersa
**Cuisine**: Italian | **Price**: $$$ | **Neighborhood**: Miami Beach
**ORDER**: The pasta. The Venetian-influenced cooking.

## Jaguar Sun
(Same as above)

## Bar Bucce
**Cuisine**: Italian wine bar | **Price**: $$ | **Neighborhood**: Wynwood
**ORDER**: The natural wines. The small Italian plates.

## To Be Determined
**Cuisine**: Contemporary | **Price**: $$$ | **Neighborhood**: Little River
**ORDER**: The seasonal menu. One of Miami's more experimental restaurants.

## Zitz Sum
**Cuisine**: Dim sum (modern) | **Price**: $$$ | **Neighborhood**: Wynwood
**ORDER**: The creative dim sum. A modern take on Hong Kong-style dim sum.

## Daniel's Miami
(Already listed above)

---

# CHICAGO ADDITIONAL (BATCH 5 & 6)

## Lao Der
(Already listed above)

## Scofflaw
(Already listed above)

## Warlord
(Already listed above)

---

# TOKYO ADDITIONAL (BATCH 6)

## Midōsuji
**Note**: This is a different Midōsuji than the Chicago one with the same name. Tokyo's Midōsuji is an older restaurant.

---

## CHATBOT ADVICE FRAMEWORKS

### If someone asks "best date night in [city]":
- LA: Bavel, Kismet, n/naka (for the SERIOUS date), République
- NY: Don Angie, Lilia, Le Bernardin (for the very serious date)
- Chicago: Galit, Monteverde, Smyth (for the serious date)
- Paris: Any bistro in the 11th, Septime, Clown Bar
- Tokyo: Den, Florilège
- Copenhagen: Kadeau, AOC
- Barcelona: Tickets, El Born neighborhood restaurants

### If someone asks "best solo bar dining":
- LA: Kato bar tasting menu, Osteria Mozza bar
- NY: Momofuku Ko counter, Le Bernardin bar
- Chicago: Avec bar, Galit communal table (walk-in)
- Tokyo: Any sushi counter, Ramen anywhere

### If someone asks "best cheap eating":
- LA: Holbox, Guerrilla Tacos, Gjusta
- NY: Superiority Burger, Joe's Shanghai, Lucali (relatively)
- Chicago: Portillo's, Pequod's, Au Cheval
- Austin: Veracruz All Natural, BBQ trailers
- Mexico City: Los Cocuyos, El Hidalguense, any market

### If someone asks "most impressive special occasion":
- LA: n/naka, Kato, Providence
- NY: Atomix, Le Bernardin, Ko
- Chicago: Alinea, Kasama, Smyth, Oriole
- Paris: Septime, Saturne
- Tokyo: Narisawa, Den, Florilège
- Copenhagen: Geranium, Alchemist

### If someone asks "best for a group":
- LA: Bestia, Majordomo, Bavel
- NY: Don Angie, Ugly Baby
- Chicago: Girl & the Goat, The Publican, Au Cheval
- Seoul: Korean BBQ (Maple Tree House), Gwangjang Market

### If someone is a vegetarian:
- LA: Kismet, Gjusta, Sqirl, Bavel (mostly)
- NY: Superiority Burger, many options
- Chicago: Galit (mostly veggie), Lula Cafe
- Paris: Septime, Les Enfants du Marché, Marché des Enfants Rouges
- Copenhagen: Geranium (fully veg/seafood since 2022), Kadeau

### If someone wants to understand a local food culture:
- LA → Holbox (Mexican-Angeleno), Guelaguetza (Oaxacan diaspora)
- Chicago → Kasama (Filipino-American story), Galit (Israeli immigrant cuisines), Portillo's (pure Chicago)
- Paris → Le Chateaubriand (started the neo-bistro movement), Marché des Enfants Rouges (market culture), Bistrot Paul Bert (the real bistro)
- Tokyo → Ichiran (solo ramen culture), Kamachiku (old Tokyo), Den (playful modern Japan)
- Mexico City → Contramar (the long lunch), Gwangjang Market equivalent = El Hidalguense
- Nashville → Arnold's Country Kitchen (meat-and-three), Prince's Hot Chicken (the original)

---

*Last updated: March 2026*
*Research sources: Michelin Guide, World's 50 Best, North America's 50 Best, LA Times, NYT, Eater, The Infatuation, Resy, Chicago Tribune, Time Out, Food & Wine, Bon Appétit, chef interviews*

---

# 📍 ADDITIONAL RESTAURANTS
> Supplementary entries for all restaurants in the Cooked database. Combined with detailed entries above = complete coverage.


## 🌴 LOS ANGELES — Additional

## Anajak Thai
**Cuisine**: Thai | **Price**: $$ (Mid-range) | **Neighborhood**: Sherman Oaks
**Chef**: Justin Pichetrungsi
**ORDER**: Nam prik ong, fermented sausage with ginger, whole fish with lime and chili, the rotating natural wine list Thai pairing
**VIBE**: Family Thai restaurant turned natural wine destination. Sherman Oaks strip mall exterior hides a warm, convivial room. The wine list is genuinely extraordinary.
**BEST FOR**: Natural wine lovers, Thai food enthusiasts, San Fernando Valley dining, people who love a surprise
**INSIDER**: Tuesday night Thai Tuesdays pop-up is a different menu at lower prices — extremely hard to get into. The natural wine list is one of LA's best. Justin's dad started the restaurant.
**CRED**: LA Times Best Restaurant 2022. Eater LA Top 10. Named-dropped by every serious LA food writer.

## Dialogue ⭐
**Cuisine**: New American | **Price**: $$$$ (Fine Dining) | **Neighborhood**: Santa Monica
**Chef**: Dave Beran
**ORDER**: The tasting menu — Beran's playful, reference-laden cuisine is LA's most intellectually stimulating dining. Changes entirely with the seasons.
**VIBE**: 8-seat counter above a wine shop in Santa Monica. Complete surrender to the chef. Intimate, funny, brilliant.
**BEST FOR**: LA's best tasting menu, counter dining at its finest, a date who appreciates humor and depth in food
**INSIDER**: Dave Beran was at Next (Chicago). The menu has recurring jokes and cultural references. 8 seats only — extremely hard to book.
**CRED**: Michelin Star. Named one of America's best restaurants by multiple publications.

## Udatsu Sushi
**Cuisine**: Japanese | **Price**: $$$$ (Fine Dining) | **Neighborhood**: West Hollywood
**Chef**: Masa Udatsu
**ORDER**: Omakase — the most technically ambitious sushi in LA. Fish aged precisely, temperature of rice calibrated obsessively.
**VIBE**: West Hollywood omakase counter. Masa Udatsu brings Tokyo sushi precision to LA.
**BEST FOR**: LA's most serious sushi, omakase counter experience, special occasion
**INSIDER**: Udatsu is obsessive about fish aging — he applies the same rigor as dry-aging beef. One of LA's most ambitious sushi chefs.
**CRED**: Considered among the top three omakase experiences in LA.

## Asanebo ⭐
**Cuisine**: Japanese | **Price**: $$$$ (Fine Dining) | **Neighborhood**: Studio City
**Chef**: Tetsuya Nakao
**ORDER**: Omakase sushi — Valley-hidden shrine to pristine fish. Uni, toro, seasonal Japanese fish all flown in.
**VIBE**: Studio City strip mall hiding a Michelin-starred omakase counter. The most under-the-radar great sushi in LA.
**BEST FOR**: Omakase in the Valley, sushi lovers who know, special occasion without the WeHo scene
**INSIDER**: Michelin-starred sushi in a strip mall — pure LA. The fish quality rivals the best in the city.
**CRED**: Michelin Star. Considered one of LA's top sushi destinations.

## Mother Wolf
**Cuisine**: Italian | **Price**: $$$ (Upscale) | **Neighborhood**: Hollywood
**Chef**: Evan Funke
**ORDER**: Hand-made pasta (Funke makes all pasta by hand with no machines — the tonnarelli cacio e pepe is the dish), wood-roasted meats, antipasto
**VIBE**: Hollywood glamour meets Roman trattoria. Dark, cinematic, packed with celebrities and serious pasta lovers.
**BEST FOR**: Best pasta in LA (and possibly America), celebrity-spotting, celebrating with Roman food
**INSIDER**: Evan Funke trained in Bologna and makes all pasta by hand. The cacio e pepe is technically perfect. Reservations hard to get.
**CRED**: Evan Funke is considered America's greatest pasta chef. Named one of LA's best restaurants by every publication.

## Mother Wolf
**Cuisine**: Italian | **Price**: $$$ (Upscale) | **Neighborhood**: Hollywood
**Chef**: Evan Funke
**ORDER**: Hand-made pasta (Funke makes all pasta by hand with no machines — the tonnarelli cacio e pepe is the dish), wood-roasted meats, antipasto
**VIBE**: Hollywood glamour meets Roman trattoria. Dark, cinematic, packed with celebrities and serious pasta lovers.
**BEST FOR**: Best pasta in LA (and possibly America), celebrity-spotting, celebrating with Roman food
**INSIDER**: Evan Funke trained in Bologna and makes all pasta by hand. The cacio e pepe is technically perfect. Reservations hard to get.
**CRED**: Evan Funke is considered America's greatest pasta chef. Named one of LA's best restaurants by every publication.

## Bub and Grandma's
**Cuisine**: Bakery | **Price**: $ (Budget) | **Neighborhood**: Glassell Park
**Chef**: Andy Kadin
**ORDER**: The sourdough (among LA's best), croissants, focaccia, whatever the seasonal bake is
**VIBE**: Glassell Park bakery and sandwich shop that became a cult phenomenon. The bread that launched a neighbourhood.
**BEST FOR**: Best sourdough in Northeast LA, bakery pilgrimage, weekend morning in Glassell Park
**INSIDER**: Andy Kadin is one of LA's best bakers. Sells out. Weekend lines. Also serves sandwiches on house-made bread.
**CRED**: LA Times and Eater LA top bakery. One of LA's most beloved neighbourhood institutions.

## l'antica pizzeria da Michele
**Cuisine**: Pizza | **Price**: $$ (Mid-range) | **Neighborhood**: Hollywood
**ORDER**: Margherita or marinara (those are the only two options) — same menu as the Naples original since 1870
**VIBE**: Hollywood outpost of the world's most famous pizzeria. The same two-pizza menu as the Naples original. Simple, perfect.
**BEST FOR**: Neapolitan pizza purists, the Eat Pray Love pizza experience in LA
**INSIDER**: Only two pizzas — margherita or marinara. This is the Naples institution from Eat Pray Love. The Hollywood location is the US original.
**CRED**: One of the world's most famous pizzerias, operating since 1870 in Naples.

## Sushi Sonagi
**Cuisine**: Japanese-Korean | **Price**: $$$ (Upscale) | **Neighborhood**: Koreatown
**ORDER**: Korean-Japanese omakase — where Korea meets Japan in a single bite. Unique technique.
**VIBE**: Koreatown omakase counter fusing Korean ingredients and flavors with Japanese sushi technique. Completely original.
**BEST FOR**: Omakase adventurers, Korean-Japanese food fusion, Koreatown dining discovery
**INSIDER**: One of the most original sushi concepts in LA. Korean ingredients like doenjang and gochugaro appear in sushi preparations.
**CRED**: One of Eater LA's most exciting new restaurants.

## Matsuhisa
**Cuisine**: Japanese-Peruvian | **Price**: $$$$ (Fine Dining) | **Neighborhood**: Beverly Hills
**Chef**: Nobu Matsuhisa
**ORDER**: The original yellowtail jalapeño, black cod miso, new style sashimi — this is where Nobu developed the dishes that conquered the world
**VIBE**: Beverly Hills original — the restaurant where Nobu invented his cuisine. Still personal, still special, now with a patina of history.
**BEST FOR**: Nobu pilgrimage, Beverly Hills power dining, Japanese-Peruvian fusion history
**INSIDER**: This is where the entire Nobu global empire started. Matsuhisa still comes here. The omakase is the most personal Nobu experience.
**CRED**: The original restaurant that launched one of the world's great restaurant empires.

## Gjelina
**Cuisine**: Californian | **Price**: $$$ (Upscale) | **Neighborhood**: Venice
**Chef**: Travis Lett
**ORDER**: Braised lamb pizza, seasonal vegetable toast, whole grain salads, wood-roasted everything, natural wine
**VIBE**: Venice institution that defined California farm-to-table for a decade. Sunny, buzzy, beautiful produce.
**BEST FOR**: Venice Beach dining, California produce enthusiasts, natural wine, long brunch
**INSIDER**: The original location. Travis Lett's cooking influenced a generation of LA chefs. The wine list is outstanding.
**CRED**: Bon Appétit Top 10 Best New Restaurants when it opened. Still one of LA's most important restaurants.

## Nobu West Hollywood
**Cuisine**: Japanese-Peruvian | **Price**: $$$$ (Fine Dining) | **Neighborhood**: West Hollywood
**Chef**: Nobu Matsuhisa
**ORDER**: Black cod miso, yellowtail jalapeño, rock shrimp tempura, new style sashimi, wagyu
**VIBE**: The WeHo Nobu — more celebrity-packed than the Malibu location, equally glamorous. The industry's dining room.
**BEST FOR**: Hollywood industry dining, celebrity spotting, Japanese-Peruvian fusion
**INSIDER**: The bar scene here is the best of any Nobu in LA. The after-10pm energy is electric.
**CRED**: One of LA's most reliably star-studded dining rooms.

## Silvers Omakase
**Cuisine**: Japanese | **Price**: $$$$ (Fine Dining) | **Neighborhood**: Brentwood
**VIBE**: A private, intimate omakase experience in Brentwood with pristine seasonal fish from Tokyo's markets.
**BEST FOR**: date night, counter/tasting menu, splurge, reservation required
**TAGS**: omakase, sushi, counter seating, reservation required, date night, intimate
**STATUS**: Rating 9.0/10 · 🔥🔥🔥

## Companion
**Cuisine**: Bakery | **Price**: $ (Budget) | **Neighborhood**: Silver Lake
**ORDER**: Naturally leavened breads, pastries, laminated doughs — everything baked with the same sourdough ethos
**VIBE**: Silver Lake bakery that's become a neighbourhood anchor. Beautiful bread, excellent coffee, sunny patio.
**BEST FOR**: Sourdough enthusiasts, morning coffee ritual, Silver Lake neighbourhood exploring
**INSIDER**: The breads sell out — come early. The almond croissant is exceptional.
**CRED**: One of LA's most celebrated bakeries. Time Out LA and LA Times picks.

## Little Fish
**Cuisine**: Seafood | **Price**: $$ (Mid-range) | **Neighborhood**: Melrose Hill
**ORDER**: Fish and chips (exceptional), fish sandwich, whatever the catch of the day is, natural wine
**VIBE**: Melrose Hill tiny seafood spot, walk-in only, doing pristine fish cookery simply and perfectly.
**BEST FOR**: The best fish and chips in LA, casual seafood lunch, natural wine with great fish
**INSIDER**: Walk-in only. Small space. The fish sourcing is serious — sustainable, traceable, delicious.
**CRED**: Eater LA and LA Times top picks for seafood.

## Bistro Na's
**Cuisine**: Chinese | **Price**: $$$ (Upscale) | **Neighborhood**: Temple City
**VIBE**: An extraordinary Chinese tasting menu experience in the SGV that rivals mainland China's finest restaurants.
**BEST FOR**: groups, reservation required
**TAGS**: sharing plates, reservation required, special occasion, innovative, group friendly
**STATUS**: Rating 9.0/10 · 🔥🔥🔥

## Bread Head
**Cuisine**: Bakery | **Price**: $ (Budget) | **Neighborhood**: Los Feliz
**VIBE**: A Los Feliz bread obsessive's dream — sourdough loaves and sandwiches that justify the morning line.
**BEST FOR**: brunch/bakery, walk-in friendly, budget-friendly
**TAGS**: bakery, great coffee, brunch, walk-ins only, sandwiches, comfort food, local legend
**STATUS**: Rating 9.0/10 · 🔥🔥🔥

## Restaurant Ki
**Cuisine**: Japanese | **Price**: $$$$ (Fine Dining) | **Neighborhood**: West Hollywood
**VIBE**: A hidden WeHo kappo counter offering a Japanese tasting experience of exceptional precision.
**BEST FOR**: date night, special occasion, counter/tasting menu, splurge, award-winning, reservation required
**TAGS**: omakase, counter seating, reservation required, date night, Michelin star, intimate
**STATUS**: Rating 9.0/10 · 🔥🔥🔥

## Petite Trois
**Cuisine**: French Bistro | **Price**: $$$ (Upscale) | **Neighborhood**: Sherman Oaks
**Chef**: Ludo Lefebvre
**ORDER**: French onion soup (the best in LA), omelette, steak frites, anything from the short classic French menu
**VIBE**: Tiny 23-seat French bistro, pure and perfect. Ludo Lefebvre's love letter to French classics. Sherman Oaks location is the gem.
**BEST FOR**: The best French bistro in LA, date night, French food purists
**INSIDER**: No reservations (Hollywood) or limited reservations (Sherman Oaks). The French onion soup has been called the best in the US.
**CRED**: Eater LA Best Restaurant. Ludo Lefebvre is one of LA's most celebrated chefs.

## NIJŪ
**Cuisine**: Japanese | **Price**: $$$$ (Fine Dining) | **Neighborhood**: West Hollywood
**ORDER**: Japanese omakase in West Hollywood — pristine fish, seasonal Japanese ingredients
**VIBE**: West Hollywood omakase counter, elegant and precise. Serious Japanese dining in the heart of the entertainment district.
**BEST FOR**: Omakase lovers, WeHo special occasion, Japanese cuisine enthusiasts
**INSIDER**: One of WeHo's best kept culinary secrets.
**CRED**: Eater LA and Time Out LA picks.

## Baran's 2239
**Cuisine**: Californian | **Price**: $$$ (Upscale) | **Neighborhood**: Culver City
**ORDER**: Counter tasting menu — California ingredients with serious technique. One of Culver City's most exciting restaurants.
**VIBE**: Culver City counter experience. Intimate, technique-driven, genuinely exciting cooking.
**BEST FOR**: Culver City fine dining, tasting menu enthusiasts, special occasion on the Westside
**INSIDER**: Counter seating only — you watch everything being made. Reservation required well in advance.
**CRED**: One of Eater LA's most praised recent restaurants.

## Pine and Crane DTLA
**Cuisine**: Taiwanese | **Price**: $$ (Mid-range) | **Neighborhood**: Downtown
**ORDER**: Three-cup chicken, scallion pancake, braised pork rice, dan dan noodles, boba milk tea
**VIBE**: Taiwanese-American counter restaurant in DTLA. Exceptional quality at honest prices. A rare find.
**BEST FOR**: Taiwanese food lovers, budget excellent eating in DTLA, quick but great lunch
**INSIDER**: Counter service, fast, always excellent. One of the best value meals in LA.
**CRED**: LA Times and Eater LA picks for best Taiwanese food in LA.

## Scopa Italian Roots
**Cuisine**: Italian | **Price**: $$$ (Upscale) | **Neighborhood**: Venice
**VIBE**: Venetian-inspired cicchetti and handmade pasta steps from the Venice boardwalk.
**BEST FOR**: date night, wine destination, cocktail destination
**TAGS**: pasta, date night, craft cocktails, outdoor seating, wine bar
**STATUS**: Rating 8.9/10 · 🔥🔥

## Highly Likely
**Cuisine**: Californian | **Price**: $$ (Mid-range) | **Neighborhood**: Mid-City
**VIBE**: LA's most charming all-day café where the grain bowls are as beautiful as the playlist.
**BEST FOR**: brunch/bakery, vegetarian-friendly, budget-friendly
**TAGS**: brunch, great coffee, vegetarian friendly, outdoor seating, farm-to-table
**STATUS**: Rating 8.9/10 · 🔥🔥

## Loreto
**Cuisine**: Mexican | **Price**: $$ (Mid-range) | **Neighborhood**: Silver Lake
**VIBE**: A Silver Lake gem serving Sonoran-inspired dishes and an exceptional mezcal program.
**BEST FOR**: date night, budget-friendly
**TAGS**: tacos, mezcal, outdoor seating, date night, sharing plates
**STATUS**: Rating 8.9/10 · 🔥🔥

## Margot
**Cuisine**: French-American | **Price**: $$$ (Upscale) | **Neighborhood**: Venice
**VIBE**: A romantic Venice bistro where steak frites and natural wine make every Tuesday feel like Paris.
**BEST FOR**: date night, wine destination
**TAGS**: date night, natural wine, outdoor seating, sharing plates, farm-to-table, wine bar
**STATUS**: Rating 8.9/10 · 🔥🔥

## Capo
**Cuisine**: Italian | **Price**: $$$$ (Fine Dining) | **Neighborhood**: Santa Monica
**VIBE**: A romantic dimly lit Santa Monica Italian where the handmade pasta and wine list reward serious diners.
**BEST FOR**: date night, wine destination, splurge, reservation required
**TAGS**: pasta, date night, special occasion, reservation required, wine bar, natural wine
**STATUS**: Rating 8.9/10 · 🔥🔥

## Diner Antonette
**Cuisine**: French Diner | **Price**: $$ (Mid-range) | **Neighborhood**: East Hollywood
**VIBE**: A charming Franco-American diner in East Hollywood with perfect omelettes and a great natural wine list.
**BEST FOR**: date night, brunch/bakery, walk-in friendly, wine destination, budget-friendly
**TAGS**: brunch, comfort food, great coffee, walk-ins only, date night, natural wine
**STATUS**: Rating 8.9/10 · 🔥🔥

## Holy Basil
**Cuisine**: Thai | **Price**: $$ (Mid-range) | **Neighborhood**: Santa Monica
**ORDER**: Southern Thai dishes — khao yam (rice salad), massaman curry, larb, anything with southern Thai coconut milk curries
**VIBE**: Santa Monica Southern Thai with natural wine. One of LA's most exciting Thai restaurants.
**BEST FOR**: Southern Thai food enthusiasts, natural wine with spicy food, Santa Monica dining
**INSIDER**: Southern Thai is distinct from central Thai — expect more coconut, more heat. The natural wine pairing is excellent.
**CRED**: One of LA's most praised Thai restaurants.

## Baby Bistro
**Cuisine**: French-Korean | **Price**: $$ (Mid-range) | **Neighborhood**: Koreatown
**VIBE**: A tiny Koreatown bistro fusing French and Korean flavors in a way that feels completely inevitable.
**BEST FOR**: date night, hidden gem, walk-in friendly, wine destination, budget-friendly, reservation required
**TAGS**: date night, natural wine, sharing plates, hidden gem, innovative, walk-ins only
**STATUS**: Rating 8.9/10 · 🔥🔥🔥

## Theia
**Cuisine**: Greek-Mediterranean | **Price**: $$$ (Upscale) | **Neighborhood**: West Hollywood
**ORDER**: Greek-Mediterranean sharing plates — dips, grilled octopus, lamb chops, mezze feast with excellent cocktails
**VIBE**: West Hollywood Greek-Mediterranean with a beautiful room and festive energy.
**BEST FOR**: Greek food lovers, groups, WeHo scene dining with better-than-average food
**INSIDER**: The cocktail program is excellent. Order the mezze spread to start.
**CRED**: One of West Hollywood's most praised openings.

## Scratch Sushi
**Cuisine**: Japanese | **Price**: $$$ (Upscale) | **Neighborhood**: Studio City
**VIBE**: A Studio City omakase counter where chef Shinji Nakano's seasonal nigiri is among the Valley's finest.
**BEST FOR**: date night, special occasion, counter/tasting menu, award-winning, reservation required
**TAGS**: omakase, counter seating, reservation required, date night, sushi, intimate, Michelin star
**STATUS**: Rating 8.9/10 · 🔥🔥🔥

## The Tasting Kitchen
**Cuisine**: American | **Price**: $$$ (Upscale) | **Neighborhood**: Venice
**VIBE**: A moody Venice institution with a serious cocktail program and wood-fire cooking.
**BEST FOR**: date night, late night, wine destination, cocktail destination
**TAGS**: craft cocktails, date night, late night, sharing plates, natural wine
**STATUS**: Rating 8.8/10 · 🔥🔥

## Dama
**Cuisine**: Mexican | **Price**: $$$ (Upscale) | **Neighborhood**: Arts District
**VIBE**: A stunning courtyard restaurant in the Arts District serving elevated Mexican cuisine.
**BEST FOR**: date night, cocktail destination
**TAGS**: outdoor seating, craft cocktails, sharing plates, date night, scene, mezcal
**STATUS**: Rating 8.8/10 · 🔥🔥

## Apollonia's Pizzeria
**Cuisine**: Pizza | **Price**: $ (Budget) | **Neighborhood**: Mid-City
**VIBE**: New York-style slices so good that Questlove and Rihanna are regulars. Open until 4am.
**BEST FOR**: late night, walk-in friendly, budget-friendly
**TAGS**: pizza, walk-ins only, late night, local legend, comfort food, open late
**STATUS**: Rating 8.8/10 · 🔥🔥

## Highly Likely Highland Park
**Cuisine**: Californian | **Price**: $$ (Mid-range) | **Neighborhood**: Highland Park
**VIBE**: The Highland Park outpost of the beloved all-day café — same magic, different neighborhood energy.
**BEST FOR**: brunch/bakery, vegetarian-friendly, budget-friendly
**TAGS**: brunch, great coffee, vegetarian friendly, outdoor seating, farm-to-table
**STATUS**: Rating 8.8/10 · 🔥🔥

## Olivetta
**Cuisine**: Italian | **Price**: $$$ (Upscale) | **Neighborhood**: West Hollywood
**VIBE**: A chic WeHo Italian with a terrace and the kind of crowd that makes you feel underdressed.
**BEST FOR**: date night, cocktail destination
**TAGS**: pasta, scene, outdoor seating, date night, craft cocktails
**STATUS**: Rating 8.8/10 · 🔥🔥

## Little Sister
**Cuisine**: Southeast Asian | **Price**: $$ (Mid-range) | **Neighborhood**: Manhattan Beach
**VIBE**: Southeast Asian street food–inspired cooking that makes the South Bay feel worldly.
**BEST FOR**: date night, budget-friendly, cocktail destination
**TAGS**: spicy, sharing plates, craft cocktails, date night, comfort food
**STATUS**: Rating 8.8/10 · 🔥🔥

## Daisy
**Cuisine**: American | **Price**: $$$ (Upscale) | **Neighborhood**: Hollywood
**VIBE**: A sunny Hollywood all-day restaurant with a gorgeous terrace and rotating California menu.
**BEST FOR**: date night, brunch/bakery, wine destination, cocktail destination
**TAGS**: brunch, outdoor seating, craft cocktails, date night, scene, natural wine
**STATUS**: Rating 8.8/10 · 🔥🔥

## Budonoki
**Cuisine**: Japanese | **Price**: $$ (Mid-range) | **Neighborhood**: Silver Lake
**VIBE**: A plant-forward Japanese restaurant in Silver Lake where the tofu and vegetable dishes are revelatory.
**BEST FOR**: date night, wine destination, vegetarian-friendly, budget-friendly
**TAGS**: vegan friendly, vegetarian friendly, sharing plates, natural wine, date night
**STATUS**: Rating 8.8/10 · 🔥🔥

## Verse LA
**Cuisine**: New American | **Price**: $$$ (Upscale) | **Neighborhood**: Downtown
**VIBE**: A stunning plant-based fine dining restaurant in Downtown LA redefining what vegan cooking can be.
**BEST FOR**: date night, special occasion, counter/tasting menu, vegetarian-friendly, reservation required
**TAGS**: vegan friendly, vegetarian friendly, farm-to-table, date night, reservation required, innovative, tasting menu
**STATUS**: Rating 8.8/10 · 🔥🔥

## RVR
**Cuisine**: Californian | **Price**: $$$ (Upscale) | **Neighborhood**: Silver Lake
**VIBE**: A Silver Lake restaurant and wine bar with a hyper-seasonal California menu and an exceptional list.
**BEST FOR**: date night, wine destination, reservation required
**TAGS**: natural wine, farm-to-table, date night, sharing plates, outdoor seating, reservation required
**STATUS**: Rating 8.8/10 · 🔥🔥

## Hakata Izakaya HERO
**Cuisine**: Japanese Izakaya | **Price**: $$ (Mid-range) | **Neighborhood**: Little Tokyo
**VIBE**: A lively Little Tokyo izakaya with yakitori, highballs, and the kind of energy that starts at midnight.
**BEST FOR**: late night, groups, walk-in friendly, budget-friendly
**TAGS**: late night, sharing plates, sake, comfort food, walk-ins only, group friendly
**STATUS**: Rating 8.8/10 · 🔥🔥🔥

## Chainsaw
**Cuisine**: Californian | **Price**: $$ (Mid-range) | **Neighborhood**: Atwater Village
**VIBE**: An Atwater Village wine bar and kitchen with a wood-fire grill and a constantly surprising menu.
**BEST FOR**: date night, walk-in friendly, wine destination, budget-friendly
**TAGS**: natural wine, outdoor seating, sharing plates, date night, walk-ins only, farm-to-table
**STATUS**: Rating 8.8/10 · 🔥🔥

## AttaGirl LA
**Cuisine**: Cocktail Bar | **Price**: $$ (Mid-range) | **Neighborhood**: West Hollywood
**VIBE**: A sleek WeHo cocktail bar by the team behind Attaboy NYC — the same no-menu, tell-us-what-you-feel magic.
**BEST FOR**: date night, late night, hidden gem, walk-in friendly, budget-friendly, reservation required, cocktail destination
**TAGS**: craft cocktails, late night, walk-ins only, date night, scene, hidden gem
**STATUS**: Rating 8.8/10 · 🔥🔥🔥

## Wilde's
**Cuisine**: Californian | **Price**: $$$ (Upscale) | **Neighborhood**: Silver Lake
**VIBE**: A Silver Lake restaurant with an Old World wine focus and a seasonal menu built around the farmers market.
**BEST FOR**: date night, wine destination, reservation required
**TAGS**: natural wine, farm-to-table, sharing plates, date night, outdoor seating, reservation required
**STATUS**: Rating 8.8/10 · 🔥🔥

## The Heights Deli & Bottle Shop
**Cuisine**: Deli | **Price**: $ (Budget) | **Neighborhood**: Glassell Park
**VIBE**: A Glassell Park deli and natural wine bottle shop — the sandwiches are legendary, the bottles are inspired.
**BEST FOR**: walk-in friendly, wine destination, budget-friendly
**TAGS**: sandwiches, natural wine, walk-ins only, local legend, great coffee, casual
**STATUS**: Rating 8.8/10 · 🔥🔥

## Blue Note Los Angeles
**Cuisine**: Jazz Club | **Price**: $$$ (Upscale) | **Neighborhood**: West Hollywood
**VIBE**: The LA outpost of the legendary NYC jazz club — live music every night in a sleek WeHo setting.
**BEST FOR**: date night, late night, cocktail destination
**TAGS**: late night, craft cocktails, date night, special occasion, live music, scene
**STATUS**: Rating 8.8/10 · 🔥🔥🔥

## Nueva
**Cuisine**: Mexican | **Price**: $$ (Mid-range) | **Neighborhood**: East Hollywood
**VIBE**: A Mexican restaurant and mezcal bar in East Hollywood with a creative menu and an exceptional agave list.
**BEST FOR**: date night, wine destination, budget-friendly
**TAGS**: tacos, mezcal, natural wine, date night, outdoor seating, sharing plates, innovative
**STATUS**: Rating 8.8/10 · 🔥🔥🔥

## Nora
**Cuisine**: Californian | **Price**: $$$ (Upscale) | **Neighborhood**: Silver Lake
**VIBE**: A Silver Lake restaurant with a hyper-seasonal menu and a natural wine list that reads like a love letter to farming.
**BEST FOR**: date night, wine destination, reservation required
**TAGS**: natural wine, farm-to-table, date night, sharing plates, reservation required, outdoor seating
**STATUS**: Rating 8.8/10 · 🔥🔥

## Jiada
**Cuisine**: Chinese | **Price**: $$$$ (Fine Dining) | **Neighborhood**: Beverly Hills
**VIBE**: A Beverly Hills upscale Chinese restaurant serving elevated dim sum and Cantonese classics in a glamorous space.
**BEST FOR**: date night, groups, splurge, reservation required
**TAGS**: sharing plates, reservation required, date night, special occasion, scene, group friendly
**STATUS**: Rating 8.8/10 · 🔥🔥

## Pasta Bar LA
**Cuisine**: Italian | **Price**: $$ (Mid-range) | **Neighborhood**: Los Feliz
**VIBE**: A Los Feliz pasta counter where a rotating single pasta is made fresh daily and paired with a natural wine list.
**BEST FOR**: date night, walk-in friendly, wine destination, budget-friendly
**TAGS**: pasta, walk-ins only, date night, natural wine, comfort food, casual
**STATUS**: Rating 8.8/10 · 🔥🔥

## Strong Water Anaheim
**Cuisine**: Cocktail Bar | **Price**: $$ (Mid-range) | **Neighborhood**: Anaheim
**VIBE**: An Anaheim tiki bar with one of the best craft cocktail programs in Southern California and a stunning interior.
**BEST FOR**: date night, late night, groups, hidden gem, walk-in friendly, budget-friendly, reservation required, cocktail destination
**TAGS**: craft cocktails, tiki, date night, walk-ins only, late night, hidden gem, group friendly
**STATUS**: Rating 8.8/10 · 🔥🔥🔥

## Elephante
**Cuisine**: Italian | **Price**: $$$ (Upscale) | **Neighborhood**: Santa Monica
**VIBE**: Rooftop Italian with Pacific views and the most photogenic aperitivo hour in Los Angeles.
**BEST FOR**: date night, rooftop/views, waterfront views, cocktail destination
**TAGS**: rooftop, waterfront, outdoor seating, craft cocktails, date night, scene, happy hour
**STATUS**: Rating 8.7/10 · 🔥🔥

## Pann's Restaurant
**Cuisine**: American Diner | **Price**: $ (Budget) | **Neighborhood**: Ladera Heights
**VIBE**: A perfectly preserved 1958 Googie diner serving fried chicken and waffles since Eisenhower.
**BEST FOR**: brunch/bakery, walk-in friendly, budget-friendly
**TAGS**: been here forever, comfort food, brunch, walk-ins only, local legend
**STATUS**: Rating 8.7/10 · 🔥🔥

## Offhand Wine Bar
**Cuisine**: Wine Bar | **Price**: $$ (Mid-range) | **Neighborhood**: Highland Park
**VIBE**: A natural wine bar in Highland Park sourcing bottles from the world's most exciting small producers.
**BEST FOR**: date night, wine destination, budget-friendly
**TAGS**: natural wine, wine bar, sharing plates, date night, outdoor seating
**STATUS**: Rating 8.7/10 · 🔥🔥

## Cobras & Matadors
**Cuisine**: Spanish Tapas | **Price**: $$ (Mid-range) | **Neighborhood**: West Hollywood
**VIBE**: A tiny WeHo tapas bar that's been feeding the creative class since 1999. Cash only.
**BEST FOR**: date night, late night, walk-in friendly, wine destination, budget-friendly
**TAGS**: sharing plates, wine bar, date night, late night, walk-ins only, been here forever
**STATUS**: Rating 8.7/10 · 🔥🔥

## Sirena
**Cuisine**: Italian Seafood | **Price**: $$$ (Upscale) | **Neighborhood**: Marina del Rey
**VIBE**: A waterfront Italian in Marina del Rey where the crudo and handmade pasta justify the boat-crowd vibe.
**BEST FOR**: date night, waterfront views, cocktail destination
**TAGS**: waterfront, seafood, pasta, outdoor seating, date night, craft cocktails
**STATUS**: Rating 8.7/10 · 🔥🔥

## Mama's Boy at Winston House
**Cuisine**: American | **Price**: $$ (Mid-range) | **Neighborhood**: Venice
**VIBE**: A lush garden brunch spot in a historic Venice cottage — the eggs and biscuits are weekend necessities.
**BEST FOR**: brunch/bakery, walk-in friendly, budget-friendly
**TAGS**: brunch, outdoor seating, great coffee, walk-ins only, comfort food
**STATUS**: Rating 8.7/10 · 🔥🔥

## Stir Crazy
**Cuisine**: Thai | **Price**: $$ (Mid-range) | **Neighborhood**: West Hollywood
**VIBE**: A tiny WeHo Thai counter that punches way above its weight with fiery curries and great wine.
**BEST FOR**: late night, walk-in friendly, wine destination, budget-friendly
**TAGS**: spicy, comfort food, walk-ins only, late night, sharing plates, natural wine
**STATUS**: Rating 8.7/10 · 🔥🔥

## Lapaba
**Cuisine**: Mexican | **Price**: $$ (Mid-range) | **Neighborhood**: Highland Park
**VIBE**: A Highland Park taqueria and mezcal bar doing Oaxacan-inspired tacos with impeccable sourcing.
**BEST FOR**: walk-in friendly, budget-friendly
**TAGS**: tacos, mezcal, outdoor seating, walk-ins only, street food, spicy
**STATUS**: Rating 8.7/10 · 🔥🔥

## Electric Bleu
**Cuisine**: French | **Price**: $$$ (Upscale) | **Neighborhood**: West Hollywood
**VIBE**: A sleek WeHo French bistro with electric-blue interiors and a buzzy late-night cocktail scene.
**BEST FOR**: date night, wine destination, reservation required, cocktail destination
**TAGS**: date night, scene, craft cocktails, reservation required, outdoor seating, natural wine
**STATUS**: Rating 8.7/10 · 🔥🔥

## Crudo Ceviche & Oyster Bar
**Cuisine**: Seafood | **Price**: $$$ (Upscale) | **Neighborhood**: Hollywood
**VIBE**: A Hollywood raw bar with impeccable sourcing — the ceviche flights and oyster selection are the draw.
**BEST FOR**: date night, wine destination, cocktail destination
**TAGS**: seafood, oysters, sharing plates, natural wine, date night, craft cocktails
**STATUS**: Rating 8.7/10 · 🔥🔥

## Forage
**Cuisine**: Californian | **Price**: $$ (Mid-range) | **Neighborhood**: Silver Lake
**VIBE**: A Silver Lake café and market with rotating seasonal sides and one of LA's best vegetable-forward menus.
**BEST FOR**: brunch/bakery, walk-in friendly, vegetarian-friendly, budget-friendly
**TAGS**: farm-to-table, vegetarian friendly, vegan friendly, brunch, walk-ins only, comfort food
**STATUS**: Rating 8.7/10 · 🔥🔥

## La Cevicheria
**Cuisine**: Peruvian | **Price**: $$ (Mid-range) | **Neighborhood**: Koreatown
**VIBE**: A Koreatown Peruvian with aguachile, tiradito, and leche de tigre that will convert you to ceviche forever.
**BEST FOR**: walk-in friendly, budget-friendly
**TAGS**: seafood, spicy, sharing plates, walk-ins only, comfort food, street food
**STATUS**: Rating 8.7/10 · 🔥🔥🔥

## Justine's Wine Bar
**Cuisine**: Wine Bar | **Price**: $$ (Mid-range) | **Neighborhood**: Silver Lake
**VIBE**: Silver Lake's most intimate natural wine bar — rotating bottles, good cheese, better conversation.
**BEST FOR**: date night, walk-in friendly, wine destination, budget-friendly
**TAGS**: natural wine, wine bar, date night, sharing plates, outdoor seating, walk-ins only
**STATUS**: Rating 8.7/10 · 🔥🔥

## CevicheStop
**Cuisine**: Peruvian | **Price**: $ (Budget) | **Neighborhood**: Mid-City
**VIBE**: A tiny Mid-City Peruvian counter where the leche de tigre is poured generously and everything costs under $15.
**BEST FOR**: hidden gem, walk-in friendly, budget-friendly, reservation required
**TAGS**: seafood, spicy, walk-ins only, street food, comfort food, hidden gem
**STATUS**: Rating 8.7/10 · 🔥🔥🔥

## Truly Pizza
**Cuisine**: Pizza | **Price**: $$ (Mid-range) | **Neighborhood**: Silver Lake
**VIBE**: A Silver Lake pizzeria with a wood-fired oven and a natural wine list that makes pizza night feel elevated.
**BEST FOR**: walk-in friendly, wine destination, budget-friendly
**TAGS**: pizza, natural wine, walk-ins only, outdoor seating, comfort food, casual
**STATUS**: Rating 8.7/10 · 🔥🔥

## The Wilkes Brentwood
**Cuisine**: American | **Price**: $$$ (Upscale) | **Neighborhood**: Brentwood
**VIBE**: A Brentwood neighborhood restaurant with a lush patio and a reliably good California-American menu.
**BEST FOR**: date night, brunch/bakery, reservation required, cocktail destination
**TAGS**: brunch, outdoor seating, craft cocktails, date night, scene, reservation required
**STATUS**: Rating 8.7/10 · 🔥🔥

## Café Tondo
**Cuisine**: Italian | **Price**: $$ (Mid-range) | **Neighborhood**: Arts District
**VIBE**: An Arts District Italian café with exceptional espresso, pastries, and a beautiful sun-drenched terrace.
**BEST FOR**: brunch/bakery, walk-in friendly, budget-friendly
**TAGS**: great coffee, brunch, outdoor seating, walk-ins only, comfort food, bakery
**STATUS**: Rating 8.7/10 · 🔥🔥

## Oybar
**Cuisine**: Wine Bar | **Price**: $$ (Mid-range) | **Neighborhood**: Echo Park
**VIBE**: An Echo Park oyster and natural wine bar that's become one of LA's most beloved neighborhood spots.
**BEST FOR**: date night, walk-in friendly, wine destination, budget-friendly
**TAGS**: natural wine, oysters, seafood, walk-ins only, date night, sharing plates, outdoor seating
**STATUS**: Rating 8.7/10 · 🔥🔥

## Zizou
**Cuisine**: Moroccan-French | **Price**: $$$ (Upscale) | **Neighborhood**: West Hollywood
**VIBE**: A WeHo Moroccan-French restaurant with a romantic courtyard and some of the city's best bastilla.
**BEST FOR**: date night, reservation required, cocktail destination
**TAGS**: date night, sharing plates, outdoor seating, craft cocktails, reservation required, scene
**STATUS**: Rating 8.7/10 · 🔥🔥

## Salt Air
**Cuisine**: Californian | **Price**: $$$ (Upscale) | **Neighborhood**: Venice
**VIBE**: A Venice coastal California restaurant with ocean views and a seafood-forward menu built for long dinners.
**BEST FOR**: date night, waterfront views, cocktail destination
**TAGS**: waterfront, seafood, date night, craft cocktails, outdoor seating, sharing plates
**STATUS**: Rating 8.7/10 · 🔥🔥

## Bacari W 3rd
**Cuisine**: Italian | **Price**: $$ (Mid-range) | **Neighborhood**: West Hollywood
**VIBE**: A Venetian cicchetti bar on W 3rd with a courtyard, great small bites, and excellent pours by the glass.
**BEST FOR**: date night, walk-in friendly, wine destination, budget-friendly
**TAGS**: sharing plates, natural wine, date night, outdoor seating, walk-ins only, happy hour
**STATUS**: Rating 8.7/10 · 🔥🔥

## Dear John's
**Cuisine**: American | **Price**: $$$ (Upscale) | **Neighborhood**: Culver City
**VIBE**: A revived 1960s Culver City supper club with a stunning renovation and cocktails that honor the original.
**BEST FOR**: date night, reservation required, cocktail destination
**TAGS**: been here forever, date night, craft cocktails, comfort food, reservation required, local legend
**STATUS**: Rating 8.7/10 · 🔥🔥

## Wabi On Rose
**Cuisine**: Japanese | **Price**: $$ (Mid-range) | **Neighborhood**: Venice
**VIBE**: A Venice Japanese wine and sake bar with izakaya-style bites and a thoughtful selection of low-intervention bottles.
**BEST FOR**: date night, walk-in friendly, wine destination, budget-friendly
**TAGS**: sake, sharing plates, date night, outdoor seating, walk-ins only, natural wine
**STATUS**: Rating 8.7/10 · 🔥🔥

## Akasha
**Cuisine**: Californian | **Price**: $$$ (Upscale) | **Neighborhood**: Culver City
**VIBE**: A Culver City restaurant in a gorgeous 1940s building with a California-organic menu and great cocktails.
**BEST FOR**: date night, brunch/bakery, vegetarian-friendly, reservation required, cocktail destination
**TAGS**: farm-to-table, brunch, vegetarian friendly, date night, craft cocktails, reservation required
**STATUS**: Rating 8.7/10 · 🔥🔥

## Black Market Liquor Bar
**Cuisine**: Bar | **Price**: $$ (Mid-range) | **Neighborhood**: Studio City
**VIBE**: A Studio City cocktail bar with one of the Valley's most inventive drinks programs and a cozy underground vibe.
**BEST FOR**: date night, late night, walk-in friendly, budget-friendly, cocktail destination
**TAGS**: craft cocktails, late night, date night, walk-ins only, scene, happy hour
**STATUS**: Rating 8.7/10 · 🔥🔥🔥

## Gigis
**Cuisine**: Italian | **Price**: $$$ (Upscale) | **Neighborhood**: West Hollywood
**VIBE**: A WeHo Italian with a warm, candlelit interior and handmade pasta that keeps the neighborhood coming back.
**BEST FOR**: date night, reservation required, cocktail destination
**TAGS**: pasta, scene, date night, outdoor seating, craft cocktails, reservation required
**STATUS**: Rating 8.7/10 · 🔥🔥

## Akuma
**Cuisine**: Japanese-American | **Price**: $$$ (Upscale) | **Neighborhood**: West Hollywood
**VIBE**: A moody WeHo Japanese restaurant where the wagyu and cocktail program draw a fashion-forward crowd.
**BEST FOR**: date night, reservation required, cocktail destination
**TAGS**: scene, craft cocktails, date night, reservation required, sharing plates, sushi
**STATUS**: Rating 8.7/10 · 🔥🔥

## Osteria La Buca
**Cuisine**: Italian | **Price**: $$ (Mid-range) | **Neighborhood**: Hollywood
**VIBE**: A Hollywood Italian institution that's been making handmade pasta and classic Roman dishes since the 1980s.
**BEST FOR**: date night, walk-in friendly, budget-friendly
**TAGS**: pasta, been here forever, date night, outdoor seating, walk-ins only, comfort food, local legend
**STATUS**: Rating 8.7/10 · 🔥🔥

## Fin
**Cuisine**: Seafood | **Price**: $$$$ (Fine Dining) | **Neighborhood**: Malibu
**VIBE**: A Malibu seafood restaurant with front-row Pacific views and impeccably sourced fish.
**BEST FOR**: date night, waterfront views, splurge, cocktail destination
**TAGS**: waterfront, oceanfront, seafood, date night, outdoor seating, craft cocktails, special occasion
**STATUS**: Rating 8.7/10 · 🔥🔥

## Malamama Pono
**Cuisine**: Hawaiian | **Price**: $$ (Mid-range) | **Neighborhood**: Culver City
**VIBE**: A Culver City Hawaiian restaurant serving loco moco, poke, and plate lunches that transport you to Oahu.
**BEST FOR**: brunch/bakery, walk-in friendly, budget-friendly
**TAGS**: comfort food, sharing plates, walk-ins only, outdoor seating, brunch, casual
**STATUS**: Rating 8.7/10 · 🔥🔥

## Catch LA
**Cuisine**: Seafood | **Price**: $$$$ (Fine Dining) | **Neighborhood**: West Hollywood
**VIBE**: WeHo's most glamorous rooftop seafood scene, where the people-watching rivals the food.
**BEST FOR**: date night, rooftop/views, groups, splurge, cocktail destination
**TAGS**: rooftop, scene, seafood, craft cocktails, outdoor seating, date night, group friendly
**STATUS**: Rating 8.6/10 · 🔥🔥

## Casa Vega
**Cuisine**: Mexican | **Price**: $$ (Mid-range) | **Neighborhood**: Sherman Oaks
**VIBE**: A 1956 San Fernando Valley institution — the enchiladas and margaritas haven't changed in 60 years.
**BEST FOR**: late night, budget-friendly, cocktail destination
**TAGS**: been here forever, craft cocktails, late night, local legend, comfort food, margaritas
**STATUS**: Rating 8.6/10 · 🔥🔥

## Taco Tu Madre
**Cuisine**: Mexican | **Price**: $ (Budget) | **Neighborhood**: West Hollywood
**VIBE**: WeHo's late-night birria taco salvation — the consommé for dipping is mandatory.
**BEST FOR**: late night, walk-in friendly, budget-friendly
**TAGS**: tacos, late night, walk-ins only, comfort food, street food, open late
**STATUS**: Rating 8.6/10 · 🔥🔥

## Bar Benjamin
**Cuisine**: Wine Bar | **Price**: $$ (Mid-range) | **Neighborhood**: Los Feliz
**VIBE**: A cozy Los Feliz wine bar pouring interesting bottles in a space that never wants you to leave.
**BEST FOR**: date night, wine destination, budget-friendly
**TAGS**: natural wine, wine bar, date night, sharing plates, outdoor seating
**STATUS**: Rating 8.6/10 · 🔥🔥

## Pez Coastal Kitchen
**Cuisine**: Seafood | **Price**: $$$ (Upscale) | **Neighborhood**: Playa del Rey
**VIBE**: A coastal seafood kitchen in Playa del Rey with fresh ceviche and ocean views from the patio.
**BEST FOR**: brunch/bakery, waterfront views, cocktail destination
**TAGS**: seafood, waterfront, outdoor seating, craft cocktails, brunch, happy hour
**STATUS**: Rating 8.6/10 · 🔥🔥

## Nando Trattoria
**Cuisine**: Italian | **Price**: $$ (Mid-range) | **Neighborhood**: Silver Lake
**VIBE**: A Silver Lake neighborhood Italian where the cacio e pepe is made tableside and the wine pours are generous.
**BEST FOR**: date night, walk-in friendly, wine destination, budget-friendly
**TAGS**: pasta, date night, natural wine, outdoor seating, walk-ins only, comfort food
**STATUS**: Rating 8.6/10 · 🔥🔥

## The Mulberry LA
**Cuisine**: British | **Price**: $$ (Mid-range) | **Neighborhood**: Los Feliz
**VIBE**: A Los Feliz British pub with a beautiful garden patio, proper scotch eggs, and excellent Sunday roasts.
**BEST FOR**: date night, brunch/bakery, walk-in friendly, budget-friendly, cocktail destination
**TAGS**: brunch, craft cocktails, outdoor seating, walk-ins only, comfort food, date night
**STATUS**: Rating 8.6/10 · 🔥🔥

## Melanie Wine Bar
**Cuisine**: Wine Bar | **Price**: $$ (Mid-range) | **Neighborhood**: East Hollywood
**VIBE**: A charming East Hollywood wine bar with low-intervention bottles and small bites that change nightly.
**BEST FOR**: date night, walk-in friendly, wine destination, budget-friendly
**TAGS**: natural wine, wine bar, date night, sharing plates, outdoor seating, walk-ins only
**STATUS**: Rating 8.6/10 · 🔥🔥

## Pino's Sandwiches
**Cuisine**: Sandwiches | **Price**: $ (Budget) | **Neighborhood**: Mid-City
**VIBE**: A legendary Mid-City Italian sandwich shop that's been feeding LA since forever. The meatball sub is mandatory.
**BEST FOR**: walk-in friendly, budget-friendly
**TAGS**: sandwiches, walk-ins only, comfort food, local legend, been here forever, cash only
**STATUS**: Rating 8.6/10 · 🔥🔥

## Somerville
**Cuisine**: American | **Price**: $$ (Mid-range) | **Neighborhood**: Atwater Village
**VIBE**: An Atwater Village all-day café with a lovely patio, great coffee, and a menu that rewards regulars.
**BEST FOR**: brunch/bakery, walk-in friendly, wine destination, budget-friendly
**TAGS**: brunch, outdoor seating, great coffee, walk-ins only, comfort food, natural wine
**STATUS**: Rating 8.6/10 · 🔥🔥

## The Otherroom
**Cuisine**: Bar | **Price**: $$ (Mid-range) | **Neighborhood**: Venice
**VIBE**: A Venice bar institution with dim lighting, great cocktails, and a back patio that feels like a secret.
**BEST FOR**: date night, late night, walk-in friendly, budget-friendly, cocktail destination
**TAGS**: craft cocktails, late night, walk-ins only, date night, outdoor seating, local legend
**STATUS**: Rating 8.6/10 · 🔥🔥

## Harvelle's
**Cuisine**: Jazz Club | **Price**: $$ (Mid-range) | **Neighborhood**: Santa Monica
**VIBE**: Santa Monica's oldest live music venue — blues and jazz nightly in a space that hasn't changed since 1931.
**BEST FOR**: date night, late night, walk-in friendly, budget-friendly, cocktail destination
**TAGS**: late night, live music, craft cocktails, been here forever, date night, walk-ins only
**STATUS**: Rating 8.6/10 · 🔥🔥

## Old Lightning
**Cuisine**: Bar | **Price**: $$ (Mid-range) | **Neighborhood**: Highland Park
**VIBE**: A Highland Park cocktail bar with serious drinks, a great jukebox, and a patio that stays busy until 2am.
**BEST FOR**: late night, walk-in friendly, wine destination, budget-friendly, cocktail destination
**TAGS**: craft cocktails, natural wine, late night, walk-ins only, outdoor seating, local legend
**STATUS**: Rating 8.6/10 · 🔥🔥

## Boneyard Bistro
**Cuisine**: BBQ | **Price**: $$ (Mid-range) | **Neighborhood**: Sherman Oaks
**VIBE**: A Sherman Oaks BBQ and craft beer bar that does both better than anyone else in the Valley.
**BEST FOR**: groups, walk-in friendly, craft beer, budget-friendly
**TAGS**: BBQ, comfort food, craft beer, group friendly, walk-ins only, local legend
**STATUS**: Rating 8.6/10 · 🔥🔥

## Peddler's Fork
**Cuisine**: American | **Price**: $$$ (Upscale) | **Neighborhood**: Calabasas
**VIBE**: A Calabasas gastropub with a rustic aesthetic and a farm-to-table menu that surprises.
**BEST FOR**: date night, groups, brunch/bakery, cocktail destination
**TAGS**: brunch, craft cocktails, outdoor seating, date night, group friendly, farm-to-table
**STATUS**: Rating 8.6/10 · 🔥🔥

## Chestnut Club
**Cuisine**: Bar | **Price**: $$ (Mid-range) | **Neighborhood**: Santa Monica
**VIBE**: A Santa Monica cocktail bar with a cozy, dimly lit interior and some of the Westside's best drinks.
**BEST FOR**: date night, late night, hidden gem, walk-in friendly, budget-friendly, reservation required, cocktail destination
**TAGS**: craft cocktails, late night, date night, walk-ins only, intimate, hidden gem
**STATUS**: Rating 8.6/10 · 🔥🔥

## Decibel Sound & Drink
**Cuisine**: Bar | **Price**: $$ (Mid-range) | **Neighborhood**: Koreatown
**VIBE**: A Koreatown sake and whisky bar with live music and a volume of good vibes that earns its name.
**BEST FOR**: late night, walk-in friendly, budget-friendly, cocktail destination
**TAGS**: late night, craft cocktails, live music, walk-ins only, sake, scene
**STATUS**: Rating 8.6/10 · 🔥🔥

## Casita
**Cuisine**: Mexican | **Price**: $$ (Mid-range) | **Neighborhood**: Los Feliz
**VIBE**: A Los Feliz Mexican restaurant and mezcal bar with a shaded patio and seriously good tacos.
**BEST FOR**: date night, walk-in friendly, budget-friendly
**TAGS**: tacos, mezcal, outdoor seating, date night, walk-ins only, comfort food
**STATUS**: Rating 8.6/10 · 🔥🔥

## Casalena
**Cuisine**: Italian | **Price**: $$$ (Upscale) | **Neighborhood**: Pacific Palisades
**VIBE**: A Pacific Palisades neighborhood Italian with a fireplace, excellent pasta, and a lovely wine list.
**BEST FOR**: date night, wine destination, reservation required
**TAGS**: pasta, date night, outdoor seating, reservation required, wine bar, comfort food
**STATUS**: Rating 8.6/10 · 🔥🔥

## Sushi Roku
**Cuisine**: Japanese | **Price**: $$$ (Upscale) | **Neighborhood**: West Hollywood
**VIBE**: A WeHo Japanese restaurant with a beautiful patio and a sushi program that balances quality with accessibility.
**BEST FOR**: date night, reservation required, cocktail destination
**TAGS**: sushi, date night, scene, craft cocktails, outdoor seating, reservation required
**STATUS**: Rating 8.6/10 · 🔥🔥

## The Night We Met
**Cuisine**: Bar | **Price**: $$ (Mid-range) | **Neighborhood**: West Hollywood
**VIBE**: A romantic WeHo cocktail bar with dim lighting, a garden patio, and drinks that live up to the name.
**BEST FOR**: date night, late night, walk-in friendly, budget-friendly, cocktail destination
**TAGS**: craft cocktails, date night, scene, late night, walk-ins only, outdoor seating
**STATUS**: Rating 8.6/10 · 🔥🔥

## Perch
**Cuisine**: French | **Price**: $$$ (Upscale) | **Neighborhood**: Downtown
**VIBE**: A French rooftop bar atop a 1923 building with sweeping DTLA skyline views.
**BEST FOR**: date night, rooftop/views, late night, cocktail destination
**TAGS**: rooftop, craft cocktails, outdoor seating, date night, scene, late night, happy hour
**STATUS**: Rating 8.5/10 · 🔥🔥

## The Lobster
**Cuisine**: Seafood | **Price**: $$$$ (Fine Dining) | **Neighborhood**: Santa Monica
**VIBE**: Perched at the end of the Santa Monica Pier with ocean views and proper New England lobster.
**BEST FOR**: date night, waterfront views, splurge
**TAGS**: waterfront, seafood, outdoor seating, date night, special occasion, oceanfront
**STATUS**: Rating 8.5/10 · 🔥🔥

## Cannonball
**Cuisine**: Seafood | **Price**: $$$ (Upscale) | **Neighborhood**: Marina del Rey
**VIBE**: A breezy marina-side seafood spot where the raw bar and frozen drinks make every day feel like summer.
**BEST FOR**: brunch/bakery, waterfront views, cocktail destination
**TAGS**: waterfront, seafood, outdoor seating, craft cocktails, brunch, happy hour
**STATUS**: Rating 8.5/10 · 🔥🔥

## Beethoven Market
**Cuisine**: Bar | **Price**: $$ (Mid-range) | **Neighborhood**: Venice
**VIBE**: A Venice neighborhood bar and bottle shop with a patio that feels like someone's very cool backyard.
**BEST FOR**: late night, walk-in friendly, wine destination, budget-friendly
**TAGS**: natural wine, walk-ins only, outdoor seating, casual, late night, local legend
**STATUS**: Rating 8.5/10 · 🔥🔥

## Vandell
**Cuisine**: Bar | **Price**: $$ (Mid-range) | **Neighborhood**: Highland Park
**VIBE**: A Highland Park neighborhood bar with a thoughtful drinks list and the vibe of a living room you never want to leave.
**BEST FOR**: late night, walk-in friendly, wine destination, budget-friendly, cocktail destination
**TAGS**: craft cocktails, natural wine, late night, walk-ins only, outdoor seating, local legend
**STATUS**: Rating 8.5/10 · 🔥🔥

## Bar 109
**Cuisine**: Bar | **Price**: $$ (Mid-range) | **Neighborhood**: Chinatown
**VIBE**: A Chinatown bar with exceptional cocktails and a low-key cool factor that attracts LA's most interesting crowd.
**BEST FOR**: late night, walk-in friendly, wine destination, budget-friendly, cocktail destination
**TAGS**: craft cocktails, late night, walk-ins only, outdoor seating, local legend, natural wine
**STATUS**: Rating 8.5/10 · 🔥🔥

## Venice Steakhouse
**Cuisine**: Steakhouse | **Price**: $$$ (Upscale) | **Neighborhood**: Venice
**VIBE**: A neighborhood Venice steakhouse with a garden patio and dry-aged cuts that earn their price.
**BEST FOR**: date night, cocktail destination
**TAGS**: steakhouse, date night, craft cocktails, outdoor seating, special occasion
**STATUS**: Rating 8.5/10 · 🔥🔥

## Flour Pizzeria
**Cuisine**: Pizza | **Price**: $ (Budget) | **Neighborhood**: Culver City
**VIBE**: A Culver City neighborhood pizza joint with a wood-fired oven and a loyal following.
**BEST FOR**: walk-in friendly, budget-friendly
**TAGS**: pizza, walk-ins only, comfort food, local legend, casual
**STATUS**: Rating 8.5/10 · 🔥🔥

## DeFranko's Submarines
**Cuisine**: Sandwiches | **Price**: $ (Budget) | **Neighborhood**: Valley Village
**VIBE**: A Valley institution since the 1960s — Italian subs built with care and served with no pretension.
**BEST FOR**: walk-in friendly, budget-friendly
**TAGS**: sandwiches, walk-ins only, comfort food, local legend, been here forever, casual
**STATUS**: Rating 8.5/10 · 🔥🔥

## Basil's Deli
**Cuisine**: Deli | **Price**: $ (Budget) | **Neighborhood**: Sherman Oaks
**VIBE**: A Sherman Oaks deli with Jewish-style sandwiches and breakfast that the Valley has loved for decades.
**BEST FOR**: brunch/bakery, walk-in friendly, budget-friendly
**TAGS**: sandwiches, walk-ins only, comfort food, brunch, local legend, casual
**STATUS**: Rating 8.5/10 · 🔥🔥

## Front Yard
**Cuisine**: Californian | **Price**: $$ (Mid-range) | **Neighborhood**: West Hollywood
**VIBE**: The garden restaurant at The Farmer's Daughter hotel — a leafy WeHo brunch institution.
**BEST FOR**: brunch/bakery, walk-in friendly, budget-friendly, cocktail destination
**TAGS**: outdoor seating, brunch, craft cocktails, happy hour, walk-ins only, scene
**STATUS**: Rating 8.5/10 · 🔥🔥

## 26 Beach
**Cuisine**: American | **Price**: $$ (Mid-range) | **Neighborhood**: Venice
**VIBE**: A Venice beach café known for its creative pancakes and the most relaxed brunch vibe in LA.
**BEST FOR**: brunch/bakery, walk-in friendly, waterfront views, budget-friendly
**TAGS**: brunch, waterfront, outdoor seating, walk-ins only, comfort food, casual
**STATUS**: Rating 8.5/10 · 🔥🔥

## M Street Kitchen
**Cuisine**: American | **Price**: $$ (Mid-range) | **Neighborhood**: Santa Monica
**VIBE**: A Santa Monica all-day café with a relaxed California vibe and reliable farm-to-table brunch.
**BEST FOR**: brunch/bakery, walk-in friendly, budget-friendly
**TAGS**: brunch, outdoor seating, great coffee, walk-ins only, comfort food, casual
**STATUS**: Rating 8.5/10 · 🔥🔥

## The Lincoln
**Cuisine**: Bar | **Price**: $$ (Mid-range) | **Neighborhood**: Venice
**VIBE**: A laid-back Venice neighborhood bar with a great back patio and reliably good cocktails.
**BEST FOR**: late night, groups, walk-in friendly, budget-friendly, cocktail destination
**TAGS**: craft cocktails, outdoor seating, late night, walk-ins only, group friendly, comfort food
**STATUS**: Rating 8.5/10 · 🔥🔥

## Larry's
**Cuisine**: Bar | **Price**: $$ (Mid-range) | **Neighborhood**: Venice
**VIBE**: A Venice Beach bar where the regulars are as interesting as the cocktail list.
**BEST FOR**: late night, walk-in friendly, budget-friendly, cocktail destination
**TAGS**: late night, walk-ins only, outdoor seating, local legend, casual, craft cocktails
**STATUS**: Rating 8.5/10 · 🔥🔥

## Sushi King
**Cuisine**: Japanese | **Price**: $$ (Mid-range) | **Neighborhood**: Culver City
**VIBE**: A Culver City sushi institution that has quietly been serving excellent rolls to regulars for decades.
**BEST FOR**: walk-in friendly, budget-friendly
**TAGS**: sushi, walk-ins only, comfort food, local legend, casual
**STATUS**: Rating 8.5/10 · 🔥🔥

## Stickett Inn
**Cuisine**: Bar | **Price**: $$ (Mid-range) | **Neighborhood**: Silver Lake
**VIBE**: A Silver Lake bar with a great Silver Lake attitude — relaxed, creative, and reliably fun.
**BEST FOR**: late night, walk-in friendly, budget-friendly, cocktail destination
**TAGS**: craft cocktails, late night, walk-ins only, outdoor seating, local legend, scene
**STATUS**: Rating 8.5/10 · 🔥🔥

## Tigre
**Cuisine**: Bar | **Price**: $$ (Mid-range) | **Neighborhood**: Silver Lake
**VIBE**: A Silver Lake mezcal and cocktail bar with a plant-filled patio that's become a neighborhood anchor.
**BEST FOR**: late night, walk-in friendly, wine destination, budget-friendly, cocktail destination
**TAGS**: craft cocktails, mezcal, late night, walk-ins only, outdoor seating, natural wine
**STATUS**: Rating 8.5/10 · 🔥🔥

## The Living Room WeHo
**Cuisine**: Bar | **Price**: $$ (Mid-range) | **Neighborhood**: West Hollywood
**VIBE**: A WeHo cocktail bar that lives up to its name — sofas, good drinks, and a patio that draws the neighborhood.
**BEST FOR**: late night, walk-in friendly, budget-friendly, cocktail destination
**TAGS**: craft cocktails, outdoor seating, late night, scene, walk-ins only, happy hour
**STATUS**: Rating 8.5/10 · 🔥🔥

## The Misfit Bar
**Cuisine**: American | **Price**: $$ (Mid-range) | **Neighborhood**: Santa Monica
**VIBE**: A Santa Monica bar that lives up to its name — the menu changes constantly and the cocktails are always good.
**BEST FOR**: late night, groups, walk-in friendly, budget-friendly, cocktail destination
**TAGS**: craft cocktails, late night, walk-ins only, outdoor seating, casual, group friendly
**STATUS**: Rating 8.5/10 · 🔥🔥

## El Compadre Hollywood
**Cuisine**: Mexican | **Price**: $$ (Mid-range) | **Neighborhood**: Hollywood
**VIBE**: A Hollywood Mexican institution since 1975 — flaming margaritas, enchiladas, and zero pretension.
**BEST FOR**: late night, walk-in friendly, budget-friendly, cocktail destination
**TAGS**: been here forever, margaritas, comfort food, walk-ins only, late night, local legend, craft cocktails
**STATUS**: Rating 8.5/10 · 🔥🔥

## Yamashiro
**Cuisine**: Japanese | **Price**: $$$ (Upscale) | **Neighborhood**: Hollywood Hills
**VIBE**: A 1914 Japanese palace atop the Hollywood Hills with panoramic city views at golden hour.
**BEST FOR**: date night, rooftop/views, cocktail destination
**TAGS**: rooftop, outdoor seating, date night, scene, craft cocktails, views
**STATUS**: Rating 8.4/10 · 🔥🔥

## The Waterfront Venice
**Cuisine**: Seafood | **Price**: $$$ (Upscale) | **Neighborhood**: Venice
**VIBE**: Venice Beach's prime waterfront spot for oysters, fish tacos, and watching life go by.
**BEST FOR**: brunch/bakery, waterfront views
**TAGS**: waterfront, outdoor seating, seafood, brunch, happy hour
**STATUS**: Rating 8.4/10 · 🔥🔥

## Valley Sandwiches
**Cuisine**: Sandwiches | **Price**: $ (Budget) | **Neighborhood**: Van Nuys
**VIBE**: A Van Nuys neighborhood sandwich shop beloved by locals for its no-fuss, generously stuffed subs.
**BEST FOR**: walk-in friendly, budget-friendly
**TAGS**: sandwiches, walk-ins only, comfort food, local legend, casual
**STATUS**: Rating 8.4/10 · 🔥🔥

## Roosterfish
**Cuisine**: Bar | **Price**: $ (Budget) | **Neighborhood**: Venice
**VIBE**: Venice's legendary dive bar since 1979 — cold beer, no attitude, and the best jukebox on the Westside.
**BEST FOR**: late night, groups, walk-in friendly, budget-friendly
**TAGS**: been here forever, late night, walk-ins only, outdoor seating, local legend, group friendly
**STATUS**: Rating 8.4/10 · 🔥🔥

## Alley Lounge
**Cuisine**: Bar | **Price**: $$ (Mid-range) | **Neighborhood**: West Hollywood
**VIBE**: A hidden WeHo bar tucked into an alley with strong drinks and the kind of low-key energy that's rare in LA.
**BEST FOR**: late night, walk-in friendly, budget-friendly, cocktail destination
**TAGS**: craft cocktails, late night, walk-ins only, scene, outdoor seating
**STATUS**: Rating 8.4/10 · 🔥🔥

## The Whaler
**Cuisine**: Bar | **Price**: $$ (Mid-range) | **Neighborhood**: Venice
**VIBE**: A Venice bar with a nautical vibe, cold beer, and an outdoor area that fills up every Friday evening.
**BEST FOR**: late night, groups, walk-in friendly, waterfront views, budget-friendly, cocktail destination
**TAGS**: outdoor seating, late night, walk-ins only, craft cocktails, group friendly, waterfront
**STATUS**: Rating 8.4/10 · 🔥🔥

## Beachside Café
**Cuisine**: American | **Price**: $$ (Mid-range) | **Neighborhood**: Santa Monica
**VIBE**: A Santa Monica beachside café where the eggs benedict tastes better with sand between your toes.
**BEST FOR**: brunch/bakery, walk-in friendly, waterfront views, budget-friendly
**TAGS**: waterfront, brunch, outdoor seating, walk-ins only, casual, oceanfront
**STATUS**: Rating 8.4/10 · 🔥🔥

## AleFire
**Cuisine**: Bar | **Price**: $ (Budget) | **Neighborhood**: Los Feliz
**VIBE**: A Los Feliz craft beer bar with a great patio, rotating taps, and no-fuss bar food.
**BEST FOR**: groups, walk-in friendly, craft beer, budget-friendly
**TAGS**: craft beer, walk-ins only, casual, group friendly, outdoor seating, happy hour
**STATUS**: Rating 8.4/10 · 🔥🔥

## Fiddler's Hearth
**Cuisine**: Irish Pub | **Price**: $$ (Mid-range) | **Neighborhood**: Pasadena
**VIBE**: A Pasadena Irish pub with live traditional music, imported Guinness, and a proper shepherd's pie.
**BEST FOR**: groups, walk-in friendly, craft beer, budget-friendly
**TAGS**: craft beer, walk-ins only, comfort food, group friendly, live music, been here forever
**STATUS**: Rating 8.4/10 · 🔥🔥

## Romeos
**Cuisine**: Bar | **Price**: $$ (Mid-range) | **Neighborhood**: Venice
**VIBE**: A Venice neighborhood bar with a back patio, strong pours, and the kind of regulars who become friends.
**BEST FOR**: late night, walk-in friendly, budget-friendly, cocktail destination
**TAGS**: outdoor seating, late night, walk-ins only, casual, local legend, craft cocktails
**STATUS**: Rating 8.4/10 · 🔥🔥

## Smoky Beach
**Cuisine**: Bar | **Price**: $$ (Mid-range) | **Neighborhood**: Venice
**VIBE**: A Venice beach bar with a fire pit, cold beer, and an easy outdoor vibe that stretches late into the evening.
**BEST FOR**: late night, walk-in friendly, waterfront views, budget-friendly, cocktail destination
**TAGS**: outdoor seating, late night, walk-ins only, casual, waterfront, craft cocktails
**STATUS**: Rating 8.4/10 · 🔥🔥

## North Italia
**Cuisine**: Italian | **Price**: $$ (Mid-range) | **Neighborhood**: Century City
**VIBE**: A reliable Century City Italian with an excellent wood-fired pizza program and a busy weekend brunch.
**BEST FOR**: groups, brunch/bakery, budget-friendly, reservation required
**TAGS**: pasta, pizza, group friendly, outdoor seating, brunch, casual, reservation required
**STATUS**: Rating 8.4/10 · 🔥🔥

## Killer Shrimp
**Cuisine**: Seafood | **Price**: $$ (Mid-range) | **Neighborhood**: Marina del Rey
**VIBE**: A Marina del Rey institution famous for one thing: a single bowl of spiced shrimp broth with bread. Perfect.
**BEST FOR**: walk-in friendly, waterfront views, budget-friendly
**TAGS**: seafood, comfort food, spicy, walk-ins only, waterfront, local legend, been here forever
**STATUS**: Rating 8.4/10 · 🔥🔥🔥

## Marix Tex Mex
**Cuisine**: Tex-Mex | **Price**: $$ (Mid-range) | **Neighborhood**: West Hollywood
**VIBE**: A WeHo Tex-Mex staple since 1986 with a packed patio, strong margaritas, and legendary fajitas.
**BEST FOR**: late night, groups, walk-in friendly, budget-friendly
**TAGS**: margaritas, outdoor seating, group friendly, late night, walk-ins only, been here forever
**STATUS**: Rating 8.4/10 · 🔥🔥

## Brennan's
**Cuisine**: Bar | **Price**: $ (Budget) | **Neighborhood**: Marina del Rey
**VIBE**: LA's most beloved dive bar — turtle racing pit, cold beer, and no pretension whatsoever.
**BEST FOR**: late night, groups, walk-in friendly, budget-friendly, cocktail destination
**TAGS**: been here forever, late night, walk-ins only, group friendly, craft cocktails, local legend
**STATUS**: Rating 8.3/10 · Very Hot

## The Airliner
**Cuisine**: Bar | **Price**: $ (Budget) | **Neighborhood**: Lincoln Heights
**VIBE**: An East LA dive bar institution with a wild backyard patio and the best cheap beer in the city.
**BEST FOR**: late night, groups, walk-in friendly, budget-friendly
**TAGS**: late night, walk-ins only, group friendly, local legend, outdoor seating
**STATUS**: Rating 8.3/10 · Very Hot

## Big Dean's Oceanfront Café
**Cuisine**: Bar | **Price**: $ (Budget) | **Neighborhood**: Santa Monica
**VIBE**: A Santa Monica beach dive bar that's been there longer than most LA natives — cold beer, feet in sand.
**BEST FOR**: walk-in friendly, waterfront views, budget-friendly
**TAGS**: waterfront, oceanfront, walk-ins only, casual, local legend, been here forever, outdoor seating
**STATUS**: Rating 8.3/10 · 🔥🔥


## 🗽 NEW YORK — Additional

## Carbone
**Cuisine**: Italian-American | **Price**: $$$$ (Fine Dining) | **Neighborhood**: Greenwich Village
**Chef**: Mario Carbone & Rich Torrisi
**ORDER**: Rigatoni vodka (the iconic one), veal parmesan tableside, spicy fusilli, whole branzino, any of the tableside preparations
**VIBE**: Red sauce Italian-American theater in Greenwich Village. Dark, glamorous, loud, celebrity-filled. The hottest table in New York for a decade.
**BEST FOR**: Scene dining, birthday splurge, out-of-towners who want the quintessential NY power dinner, Italian-American food elevated
**INSIDER**: One of the hardest reservations in NYC — try on Resy exactly at midnight 28 days out. The tableside vodka rigatoni is a performance. Celebrity sightings guaranteed.
**CRED**: NY Times 3 stars. Most photographed pasta in America. A- list celebrity haunt. Bon Appétit Best Restaurant.

## Una Pizza Napoletana
**Cuisine**: Pizza | **Price**: $$$ (Upscale) | **Neighborhood**: Lower East Side
**Chef**: Anthony Mangieri
**ORDER**: Filetti (fresh tomato, fior di latte, basil) or Margherita — only five pizzas on the menu, all extraordinary
**VIBE**: Anthony Mangieri makes five pizzas a day, sold until they're gone. The most purist Neapolitan pizza in America.
**BEST FOR**: Pizza perfectionists, Neapolitan pizza enthusiasts, the most serious pizza in New York
**INSIDER**: Opens at 5pm, sells out. Limited seating, book ahead. Mangieri makes every pizza himself. Only five options on the menu — all extraordinary.
**CRED**: Consistently ranked in America's top 5 pizza restaurants. Mangieri is considered America's greatest pizza maker.

## Torrisi
**Cuisine**: Italian-American | **Price**: $$$$ (Fine Dining) | **Neighborhood**: SoHo
**Chef**: Mario Carbone & Rich Torrisi
**ORDER**: The prix-fixe Italian-American tasting menu — the most technically sophisticated red-sauce cooking in existence. The veal, the pasta, the heritage ingredients.
**VIBE**: SoHo, intimate and cerebral. The spiritual successor to the original Torrisi Italian Specialties that launched careers. Pure, obsessive Italian-American cooking.
**BEST FOR**: NYC's most intellectually exciting Italian dinner, special occasion, Carbone universe fans
**INSIDER**: The original Torrisi closed; this new iteration is even more ambitious. Very hard to book. Mario Carbone at his most serious.
**CRED**: NY Times critics' top pick. One of NYC's most anticipated reopenings.

## Attaboy
**Cuisine**: Cocktail Bar | **Price**: $$ (Mid-range) | **Neighborhood**: Lower East Side
**ORDER**: No menu — tell them what you like and they'll make something extraordinary. Classics done perfectly or off-menu creations.
**VIBE**: Lower East Side speakeasy with no menu and no sign. Ring the bell. The bartenders make what they want based on what you tell them.
**BEST FOR**: Serious cocktail enthusiasts, first date with someone who loves bars, anyone who wants to surrender to the bartender's creativity
**INSIDER**: From the former team at Milk & Honey (Sam Ross invented the Paper Plane here). No reservations, queue outside. Small, dark, magical.
**CRED**: World's 50 Best Bars. Consistently considered one of the world's greatest cocktail bars.

## Russ & Daughters 🏆
**Cuisine**: Jewish Deli | **Price**: $$ (Mid-range) | **Neighborhood**: Lower East Side
**ORDER**: Nova salmon on bagel with cream cheese, sable on rye, herring, caviar service, egg cream, pickled vegetables
**VIBE**: Lower East Side Jewish appetizing institution since 1914. The most important Jewish food counter in America.
**BEST FOR**: Jewish food pilgrimage, the best smoked fish in America, Lower East Side history, brunch
**INSIDER**: The café on Orchard Street has table service; the original shop on Houston is counter-only. The James Beard award recognised the whole family institution.
**CRED**: James Beard America's Classics. Operating since 1914. The most important Jewish food institution in America.

## Double Chicken Please 🏅
**Cuisine**: Cocktail Bar | **Price**: $$ (Mid-range) | **Neighborhood**: Lower East Side
**ORDER**: The menu is designed as a 'restaurant menu' — each cocktail is paired with a food concept. Order the full tasting flight.
**VIBE**: Lower East Side two-room bar — front room is fast casual (walk-in), back room is reservation-only fine cocktail experience. Conceptually brilliant.
**BEST FOR**: Cocktail enthusiasts, NYC's most inventive bar experience, date night
**INSIDER**: Walk into the front for the quick counter experience. Book the back room (Coop) for the tasting flight. World's 50 Best Bars top 10.
**CRED**: World's 50 Best Bars top 10. One of the world's most exciting cocktail bars.

## Misi
**Cuisine**: Italian | **Price**: $$$ (Upscale) | **Neighborhood**: Williamsburg
**Chef**: Missy Robbins
**ORDER**: Orecchiette with sausage, campanelle, any pasta with butter and cheese, the vegetable antipasto
**VIBE**: Missy Robbins' more casual Williamsburg sister to Lilia. Still exceptional pasta, slightly easier to book.
**BEST FOR**: Brooklyn pasta dinner, date night, Williamsburg neighborhood dining
**INSIDER**: Easier to book than Lilia. The pasta program is equally brilliant. More vegetable-focused than Lilia.
**CRED**: NY Times 2 stars. James Beard nominated.

## Raoul's
**Cuisine**: French Bistro | **Price**: $$$ (Upscale) | **Neighborhood**: SoHo
**ORDER**: Steak au poivre (the legendary one), escargot, profiteroles, the whole French bistro canon done perfectly
**VIBE**: SoHo French bistro since 1975. Dark, candlelit, packed with artists and lovers. The most romantic room in New York.
**BEST FOR**: The most romantic dinner in NYC, classic French bistro food, celebrating something intimate
**INSIDER**: The steak au poivre has been the dish for 50 years. Very hard to get in — call well ahead. Downstairs is the bar.
**CRED**: NYC institution since 1975. Every food writer's personal favourite. One of the world's great bistros.

## I Sodi
**Cuisine**: Tuscan | **Price**: $$$ (Upscale) | **Neighborhood**: West Village
**Chef**: Rita Sodi
**ORDER**: Ribollita (Tuscan bread soup), pappardelle with wild boar, whole roasted chicken, olive oil cake
**VIBE**: Tiny West Village Tuscan restaurant. Candlelit, completely intimate, one of the most genuinely Italian rooms in the city.
**BEST FOR**: Authentic Tuscan cooking, the best ribollita in America, intimate date night
**INSIDER**: Rita Sodi is Florentine — this is her home cooking, not Italian-American. The ribollita changes seasonally. Very small, book ahead.
**CRED**: NY Times 2 stars. One of NYC's most beloved Italian restaurants.

## 4 Charles Prime Rib
**Cuisine**: Steakhouse | **Price**: $$$$ (Fine Dining) | **Neighborhood**: West Village
**ORDER**: Prime rib (the whole point), shrimp cocktail, wedge salad, potato gratin, chocolate mousse
**VIBE**: West Village private club energy — you need to know about this place to find it. Dark, intimate, old-school steakhouse glamour.
**BEST FOR**: Classic NYC steakhouse experience, date night, celebrating something with red meat and red wine
**INSIDER**: Reservations technically required but it operates like a private club. Prime rib is carved tableside. One of NYC's best kept secrets.
**CRED**: Bon Appétit Top 10. Cult status among NYC food insiders.

## PDT
**Cuisine**: Cocktail Bar | **Price**: $$ (Mid-range) | **Neighborhood**: East Village
**ORDER**: The seasonal cocktail menu — PDT invented the NYC speakeasy cocktail movement. The Benton's Old Fashioned with bacon-fat-washed bourbon is legendary.
**VIBE**: Enter through a telephone booth in a hot dog shop. The original NYC speakeasy bar. Dark, intimate, reservation-only.
**BEST FOR**: The original speakeasy cocktail experience, date night, cocktail history lovers
**INSIDER**: Enter through Crif Dogs' phone booth on St. Marks Place. Reservations required. Jim Meehan wrote the essential cocktail book here.
**CRED**: World's 50 Best Bars. The bar that launched the NYC speakeasy cocktail movement.

## Balthazar
**Cuisine**: French Brasserie | **Price**: $$$ (Upscale) | **Neighborhood**: SoHo
**Chef**: Keith McNally
**ORDER**: Steak frites, fruits de mer plateau, croque monsieur, soupe à l'oignon, anything from the patisserie
**VIBE**: The great Parisian brasserie that New York deserves. Zinc bar, mirrored walls, packed at all hours. SoHo at its most cinematic.
**BEST FOR**: Classic New York brunch or dinner, impressing out-of-towners, late night after a show, oyster and champagne afternoon
**INSIDER**: Open from 7:30am to late. The bread from Balthazar Bakery next door is extraordinary. Weekend brunch has long waits — go at opening. Keith McNally invented modern NYC dining.
**CRED**: NYC institution since 1997. Called the best brasserie in America repeatedly.

## Dante 🏅
**Cuisine**: Italian Bar | **Price**: $$ (Mid-range) | **Neighborhood**: Greenwich Village
**ORDER**: Negroni (the house classic), Garibaldi (their signature fresh orange juice and Campari), any Aperol-based cocktail, pasta
**VIBE**: West Village Italian café and bar. Sun-drenched by day, sultry by night. Perfectly executed Aperol spritzes on the sidewalk terrace.
**BEST FOR**: Aperitivo hour, first date, Sunday afternoon, cocktail lovers, Italian bar experience in NYC
**INSIDER**: Dante in Greenwich Village is the original — the East Village outpost Dante West Village is also excellent. The Garibaldi made with freshly squeezed Sicilian blood oranges is the drink.
**CRED**: World's Best Bar #1 (2019). Most important cocktail bar in NYC.

## Pizzeria Sei
**Cuisine**: Pizza | **Price**: $$ (Mid-range) | **Neighborhood**: West Village
**Chef**: William Joo
**ORDER**: Roman-style square pizza, the white pizza with house-made ricotta, seasonal toppings
**VIBE**: West Village Roman-style pizza with natural wine. Small, warm, the kind of place you want to come every week.
**BEST FOR**: Roman pizza fans, West Village neighbourhood dining, natural wine with great food
**INSIDER**: Walk-in only. One of the best pizzas in NYC, and it's not even Neapolitan.
**CRED**: Eater NY Top 10. NY Times praised.

## Peasant
**Cuisine**: Italian | **Price**: $$$ (Upscale) | **Neighborhood**: NoLIta
**VIBE**: A NoLIta Italian cooking everything in wood-burning ovens since 1999 — rustic, romantic, and perfect.
**BEST FOR**: date night, wine destination, reservation required
**TAGS**: wood fire, date night, reservation required, been here forever, natural wine, pasta, intimate
**STATUS**: Rating 9.0/10 · 🔥🔥🔥

## John's of Bleecker Street
**Cuisine**: Pizza | **Price**: $$ (Mid-range) | **Neighborhood**: West Village
**ORDER**: Coal-fired whole pizza — you order by the pie, not the slice
**VIBE**: West Village coal-fired pizza institution since 1929. Church pew seating, initials carved into the booths, pure old New York.
**BEST FOR**: Classic NYC pizza institution, groups, West Village history, coal-fired pizza
**INSIDER**: Cash only. No slices — whole pies only. The initials carved into the booths go back decades.
**CRED**: NYC institution since 1929. One of the most storied pizzerias in America.

## Yokox Omakase
**Cuisine**: Japanese | **Price**: $$$$ (Fine Dining) | **Neighborhood**: Midtown
**VIBE**: A Midtown omakase counter where the seasonal nigiri program draws serious sushi devotees from across the city.
**BEST FOR**: date night, special occasion, counter/tasting menu, splurge, award-winning, reservation required
**TAGS**: omakase, counter seating, reservation required, date night, Michelin star, intimate, sushi
**STATUS**: Rating 9.0/10 · 🔥🔥🔥

## Shinzo Omakase
**Cuisine**: Japanese | **Price**: $$$$ (Fine Dining) | **Neighborhood**: East Village
**VIBE**: A hidden East Village omakase with Michelin recognition and nigiri that prioritizes texture over flash.
**BEST FOR**: date night, special occasion, counter/tasting menu, splurge, award-winning, reservation required
**TAGS**: omakase, counter seating, reservation required, date night, Michelin star, sushi, intimate
**STATUS**: Rating 9.0/10 · 🔥🔥🔥

## Thai Diner
**Cuisine**: Thai-American | **Price**: $$ (Mid-range) | **Neighborhood**: NoLIta
**VIBE**: A Thai-American diner hybrid where larb meets club sandwiches in the most delightful way.
**BEST FOR**: brunch/bakery, walk-in friendly, budget-friendly
**TAGS**: brunch, comfort food, sharing plates, great coffee, walk-ins only, new opening
**STATUS**: Rating 8.9/10 · 🔥🔥

## Momofuku Noodle Bar
**Cuisine**: Asian-American | **Price**: $$ (Mid-range) | **Neighborhood**: East Village
**VIBE**: Where David Chang started it all — the pork bun that changed American dining.
**BEST FOR**: late night, walk-in friendly, budget-friendly
**TAGS**: ramen, late night, walk-ins only, celebrity chef, comfort food, local legend
**STATUS**: Rating 8.9/10 · 🔥🔥

## Emilio's Ballato
**Cuisine**: Italian-American | **Price**: $$$ (Upscale) | **Neighborhood**: SoHo
**Chef**: Emilio Vitolo Jr.
**ORDER**: Rigatoni pomodoro (the best in the city), veal parm, anything Emilio recommends, tiramisu
**VIBE**: SoHo red-sauce institution that's been there since forever. Emilio himself is usually there. Always a celebrity in the corner.
**BEST FOR**: Classic Italian-American dining, celebrity spotting, a taste of old New York
**INSIDER**: Emilio has been feeding artists and celebrities since the 80s. Basquiat used to eat here. Still cash-preferred. Reservations hard.
**CRED**: NYC institution. Celebrity regular haunt since the 1980s.

## Kings Co Imperial
**Cuisine**: Chinese-American | **Price**: $$ (Mid-range) | **Neighborhood**: Lower East Side
**VIBE**: A Lower East Side Chinese-American restaurant that rethinks what a neighborhood Chinese spot can be.
**BEST FOR**: date night, late night, walk-in friendly, wine destination, budget-friendly
**TAGS**: sharing plates, late night, walk-ins only, innovative, date night, natural wine
**STATUS**: Rating 8.9/10 · 🔥🔥🔥

## The Corner Store
**Cuisine**: American | **Price**: $$$ (Upscale) | **Neighborhood**: NoLIta
**VIBE**: The Soho House team's NoLIta American brasserie — all the glamour with slightly less attitude.
**BEST FOR**: date night, brunch/bakery, reservation required, cocktail destination
**TAGS**: scene, new opening, brunch, date night, craft cocktails, reservation required
**STATUS**: Rating 8.9/10 · 🔥🔥🔥

## The Surf Lodge
**Cuisine**: Californian | **Price**: $$$$ (Fine Dining) | **Neighborhood**: Montauk
**VIBE**: The Hamptons' most beautiful waterfront restaurant — live music, lobster rolls, and a golden-hour crowd.
**BEST FOR**: date night, waterfront views, splurge, reservation required, cocktail destination
**TAGS**: waterfront, outdoor seating, scene, craft cocktails, reservation required, date night, live music
**STATUS**: Rating 8.9/10 · 🔥🔥🔥

## The Office of Mr. Moto
**Cuisine**: Cocktail Bar | **Price**: $$ (Mid-range) | **Neighborhood**: Lower East Side
**VIBE**: A Japanese-themed speakeasy on the Lower East Side with immaculate cocktails and an impossibly cool atmosphere.
**BEST FOR**: date night, late night, hidden gem, budget-friendly, reservation required, cocktail destination
**TAGS**: craft cocktails, speakeasy, hidden gem, date night, late night, reservation required
**STATUS**: Rating 8.9/10 · 🔥🔥🔥

## Kaki
**Cuisine**: Japanese | **Price**: $$$ (Upscale) | **Neighborhood**: West Village
**VIBE**: A West Village Japanese counter specializing in oysters and seasonal seafood with a beautifully curated sake list.
**BEST FOR**: date night, counter/tasting menu, reservation required
**TAGS**: omakase, counter seating, reservation required, date night, innovative, sake, intimate
**STATUS**: Rating 8.9/10 · 🔥🔥🔥

## Taikun Sushi
**Cuisine**: Japanese | **Price**: $$$$ (Fine Dining) | **Neighborhood**: Midtown
**VIBE**: A Midtown omakase counter with a chef-driven approach to Edomae sushi and an excellent sake pairing.
**BEST FOR**: date night, counter/tasting menu, splurge, reservation required
**TAGS**: omakase, counter seating, reservation required, date night, sushi, innovative
**STATUS**: Rating 8.9/10 · 🔥🔥🔥

## Don Antonio
**Cuisine**: Pizza | **Price**: $$ (Mid-range) | **Neighborhood**: Midtown
**VIBE**: A Midtown Neapolitan pizzeria from the Starita family — the montanara fritta pizza is unlike anything else in NYC.
**BEST FOR**: groups, walk-in friendly, budget-friendly
**TAGS**: pizza, walk-ins only, Neapolitan, wood fire, local legend, group friendly
**STATUS**: Rating 8.9/10 · 🔥🔥🔥

## Lombardi's Pizza
**Cuisine**: Pizza | **Price**: $$ (Mid-range) | **Neighborhood**: NoLIta
**ORDER**: Classic margherita or white pie from America's oldest pizzeria
**VIBE**: America's first pizzeria, open since 1905 in NoLIta. Historic, touristy, but genuinely good coal-fired pizza.
**BEST FOR**: Pizza history, groups, tourist bucket list NYC, coal-fired old-school pizza
**INSIDER**: Can get very busy with tourists. Cash only, whole pies only. The clam pie is a worthy departure.
**CRED**: America's oldest pizzeria, open since 1905.

## Ippudo NY
**Cuisine**: Japanese | **Price**: $$ (Mid-range) | **Neighborhood**: East Village
**ORDER**: Shiromaru classic (tonkotsu broth, thin noodles), Akamaru modern (rich miso), buns, kakuni pork
**VIBE**: The ramen chain that introduced New York to serious Japanese ramen. Still excellent, always packed.
**BEST FOR**: The best chain ramen in NYC, ramen lovers, quick but quality noodle bowl
**INSIDER**: The original East Village location is iconic. Long waits on weekends. The Akamaru Modern is the more complex bowl.
**CRED**: The ramen that changed NYC. Ippudo is considered the standard for Japanese ramen in America.

## Veselka
**Cuisine**: Ukrainian | **Price**: $ (Budget) | **Neighborhood**: East Village
**ORDER**: Borscht, pierogies, beet salad, stuffed cabbage, challah French toast at brunch — Ukrainian comfort food all day
**VIBE**: East Village Ukrainian diner since 1954. Open 24 hours. The soul of old New York.
**BEST FOR**: Late night eating, NYC institution, Ukrainian comfort food, after a show or night out
**INSIDER**: Open 24 hours. The borscht is famous. A true NYC institution that has served everyone from Ukrainians to celebrities.
**CRED**: East Village institution since 1954. Open 24 hours. NYC's most beloved Ukrainian diner.

## Freemans
**Cuisine**: American | **Price**: $$$ (Upscale) | **Neighborhood**: Lower East Side
**ORDER**: Artichoke dip (the forever classic), chilled seafood, pork chop, rabbit, anything from the taxidermy-lined room
**VIBE**: At the end of a secret alley in the Lower East Side. Taxidermy on the walls, candlelit, hunting lodge aesthetic. The most atmospheric restaurant in NYC.
**BEST FOR**: First date, out-of-towners wanting a unique NYC experience, atmospheric dining, Lower East Side exploring
**INSIDER**: The alley is actually called Freeman's Alley — follow it off Rivington Street. One of the most romantic rooms in the city.
**CRED**: NYC institution since 2004. On nearly every 'hidden gem NYC' list.

## ABC Kitchen
**Cuisine**: American | **Price**: $$$ (Upscale) | **Neighborhood**: Flatiron
**Chef**: Jean-Georges Vongerichten
**ORDER**: Crab toast, house-made pasta, roasted carrot and avocado salad, wood-roasted chicken, apple tart tatin
**VIBE**: Airy, beautiful Flatiron farm-to-table with white walls and botanical energy. Part of the ABC Home store. Jean-Georges goes sustainable.
**BEST FOR**: Power lunch, vegetable-forward dining, impressive date, Flatiron neighborhood dining
**INSIDER**: Connected to the ABC Home and Carpet store — great for browsing before or after. Jean-Georges' most relaxed and accessible restaurant.
**CRED**: James Beard Best New Restaurant. Jean-Georges Vongerichten's sustainable flagship.

## Apotheke
**Cuisine**: Cocktail Bar | **Price**: $$ (Mid-range) | **Neighborhood**: Chinatown
**VIBE**: A pharmacy-turned-speakeasy in Chinatown where the botanical cocktails are prescriptions for a great night.
**BEST FOR**: date night, late night, hidden gem, budget-friendly, reservation required, cocktail destination
**TAGS**: craft cocktails, late night, date night, speakeasy, hidden gem
**STATUS**: Rating 8.8/10 · 🔥🔥

## Piccola Strada
**Cuisine**: Italian | **Price**: $$ (Mid-range) | **Neighborhood**: West Village
**VIBE**: A tiny West Village Italian with six tables, exceptional pasta, and a wine list that rewards exploration.
**BEST FOR**: date night, walk-in friendly, wine destination, budget-friendly
**TAGS**: pasta, walk-ins only, date night, natural wine, outdoor seating, intimate
**STATUS**: Rating 8.8/10 · 🔥🔥

## Wayla
**Cuisine**: Thai | **Price**: $$ (Mid-range) | **Neighborhood**: Lower East Side
**VIBE**: A Lower East Side Thai restaurant with a rooftop and a menu that channels Bangkok's more elegant side.
**BEST FOR**: date night, wine destination, budget-friendly, reservation required
**TAGS**: spicy, sharing plates, date night, natural wine, reservation required, outdoor seating
**STATUS**: Rating 8.8/10 · 🔥🔥🔥

## Sammy's Roumanian Steakhouse
**Cuisine**: Jewish-Romanian | **Price**: $$$ (Upscale) | **Neighborhood**: Lower East Side
**VIBE**: A basement LES institution where frozen vodka, live music, and schmaltz on the table is the whole point.
**BEST FOR**: groups
**TAGS**: been here forever, group friendly, bucket list, local legend, comfort food, special occasion
**STATUS**: Rating 8.8/10 · 🔥🔥🔥

## Principe
**Cuisine**: Italian | **Price**: $$$ (Upscale) | **Neighborhood**: West Village
**VIBE**: A West Village Italian where the rigatoni all'amatriciana might be the best single pasta dish in New York.
**BEST FOR**: date night, wine destination, reservation required
**TAGS**: pasta, date night, reservation required, intimate, natural wine, been here forever
**STATUS**: Rating 8.8/10 · 🔥🔥

## Ward III
**Cuisine**: Cocktail Bar | **Price**: $$ (Mid-range) | **Neighborhood**: TriBeCa
**VIBE**: A TriBeCa cocktail bar that's been quietly making some of downtown Manhattan's best drinks since 2009.
**BEST FOR**: date night, late night, hidden gem, walk-in friendly, budget-friendly, reservation required, cocktail destination
**TAGS**: craft cocktails, date night, late night, walk-ins only, intimate, hidden gem
**STATUS**: Rating 8.8/10 · 🔥🔥

## Il Mulino Downtown
**Cuisine**: Italian | **Price**: $$$$ (Fine Dining) | **Neighborhood**: West Village
**VIBE**: A classic Italian fine dining institution in the West Village where the osso buco has been perfect for decades.
**BEST FOR**: date night, splurge, reservation required
**TAGS**: pasta, date night, special occasion, reservation required, been here forever, celebrity chef
**STATUS**: Rating 8.8/10 · 🔥🔥

## Filé Gumbo Bar
**Cuisine**: Cajun-Creole | **Price**: $$ (Mid-range) | **Neighborhood**: Harlem
**VIBE**: Harlem's finest Cajun-Creole kitchen — the gumbo is thick, spicy, and deeply comforting.
**BEST FOR**: groups, walk-in friendly, budget-friendly
**TAGS**: comfort food, spicy, walk-ins only, local legend, sharing plates, group friendly
**STATUS**: Rating 8.8/10 · 🔥🔥🔥

## Norikaya
**Cuisine**: Japanese | **Price**: $$$ (Upscale) | **Neighborhood**: East Village
**VIBE**: A East Village Japanese kappo counter where the creative kaiseki-inspired tasting menu changes with the seasons.
**BEST FOR**: date night, counter/tasting menu, reservation required
**TAGS**: omakase, sake, counter seating, reservation required, date night, intimate, innovative
**STATUS**: Rating 8.8/10 · 🔥🔥

## Zen Sushi Omakase
**Cuisine**: Japanese | **Price**: $$$$ (Fine Dining) | **Neighborhood**: East Village
**VIBE**: An East Village intimate omakase counter with pristine fish and a thoughtful seasonal menu.
**BEST FOR**: date night, counter/tasting menu, splurge, reservation required
**TAGS**: omakase, counter seating, reservation required, date night, sushi, intimate
**STATUS**: Rating 8.8/10 · 🔥🔥

## SourAji
**Cuisine**: Korean-Japanese | **Price**: $$ (Mid-range) | **Neighborhood**: East Village
**VIBE**: A Korean-Japanese East Village spot known for its fermented and pickled small plates and a natural wine list.
**BEST FOR**: date night, late night, walk-in friendly, wine destination, budget-friendly
**TAGS**: walk-ins only, sharing plates, innovative, late night, spicy, date night, natural wine
**STATUS**: Rating 8.8/10 · 🔥🔥🔥

## Sataki
**Cuisine**: Japanese | **Price**: $$$ (Upscale) | **Neighborhood**: East Village
**VIBE**: An East Village Japanese counter where the chef's creative kappo tasting menu changes nightly.
**BEST FOR**: date night, counter/tasting menu, reservation required
**TAGS**: omakase, counter seating, reservation required, date night, sake, innovative, intimate
**STATUS**: Rating 8.8/10 · 🔥🔥

## Cafe Mogador
**Cuisine**: Moroccan | **Price**: $$ (Mid-range) | **Neighborhood**: East Village
**ORDER**: Shakshuka, Moroccan chicken with preserved lemon, mezze plates, mint tea, eggs any way for brunch
**VIBE**: East Village institution since 1983. Morocco meets NYC in a warm, candlelit room that never gets old.
**BEST FOR**: East Village brunch, date night with Middle Eastern food, NYC institution lovers
**INSIDER**: One of NYC's great neighborhood restaurants. Cash-friendly. The eggs shakshuka is a brunch institution.
**CRED**: East Village institution for 40+ years. Featured in countless NYC guides.

## Bathtub Gin
**Cuisine**: Cocktail Bar | **Price**: $$ (Mid-range) | **Neighborhood**: Chelsea
**VIBE**: A speakeasy hidden behind a coffee shop in Chelsea with prohibition-era cocktails and live jazz.
**BEST FOR**: date night, late night, hidden gem, budget-friendly, reservation required, cocktail destination
**TAGS**: craft cocktails, hidden gem, date night, late night, speakeasy
**STATUS**: Rating 8.7/10 · 🔥🔥

## Lucky's Soho
**Cuisine**: American | **Price**: $$$ (Upscale) | **Neighborhood**: SoHo
**VIBE**: A SoHo brasserie with a beautiful terrace, perfect for weekend brunch and long afternoon rosé sessions.
**BEST FOR**: date night, brunch/bakery, reservation required, cocktail destination
**TAGS**: brunch, scene, craft cocktails, outdoor seating, date night, reservation required
**STATUS**: Rating 8.7/10 · 🔥🔥

## Gnocchi on 9th
**Cuisine**: Italian | **Price**: $$ (Mid-range) | **Neighborhood**: Chelsea
**VIBE**: A Chelsea pasta spot where the gnocchi is made fresh daily and the sauce is the kind you call your mom about.
**BEST FOR**: date night, walk-in friendly, budget-friendly
**TAGS**: pasta, walk-ins only, comfort food, date night, outdoor seating, casual
**STATUS**: Rating 8.7/10 · 🔥🔥

## Macao Trading Co.
**Cuisine**: Cocktail Bar | **Price**: $$ (Mid-range) | **Neighborhood**: TriBeCa
**VIBE**: A TriBeCa opium den–inspired bar with outstanding cocktails and a menu of Portuguese-Chinese bar food.
**BEST FOR**: date night, late night, walk-in friendly, budget-friendly, reservation required, cocktail destination
**TAGS**: craft cocktails, late night, date night, walk-ins only, scene, speakeasy
**STATUS**: Rating 8.7/10 · 🔥🔥

## FUHU
**Cuisine**: Chinese | **Price**: $$$ (Upscale) | **Neighborhood**: Midtown
**VIBE**: A sleek Midtown Chinese restaurant with a modern dim sum program and a cocktail list that holds its own.
**BEST FOR**: date night, reservation required, cocktail destination
**TAGS**: sharing plates, scene, date night, craft cocktails, reservation required, dim sum
**STATUS**: Rating 8.7/10 · 🔥🔥

## Yellowtail
**Cuisine**: Japanese | **Price**: $$$$ (Fine Dining) | **Neighborhood**: Midtown
**VIBE**: Akira Back's Midtown Japanese with a celebrity clientele and a sushi program that earns the price tag.
**BEST FOR**: date night, splurge, reservation required, cocktail destination
**TAGS**: scene, date night, craft cocktails, sushi, reservation required, celebrity chef
**STATUS**: Rating 8.7/10 · 🔥🔥

## Elysee Restaurant
**Cuisine**: French | **Price**: $$$ (Upscale) | **Neighborhood**: Midtown
**VIBE**: A Midtown French brasserie inside the historic Elysée Hotel where the piano bar and French onion soup are institutions.
**BEST FOR**: date night, reservation required, cocktail destination
**TAGS**: date night, been here forever, reservation required, special occasion, scene, craft cocktails
**STATUS**: Rating 8.7/10 · 🔥🔥

## Peppilino
**Cuisine**: Italian | **Price**: $$ (Mid-range) | **Neighborhood**: West Village
**VIBE**: A tiny West Village Italian with exceptional fresh pasta and a natural wine list that changes with the seasons.
**BEST FOR**: date night, walk-in friendly, wine destination, budget-friendly
**TAGS**: pasta, walk-ins only, date night, natural wine, outdoor seating, intimate, casual
**STATUS**: Rating 8.7/10 · 🔥🔥

## Si! Mon
**Cuisine**: Pan-Latin | **Price**: $$$ (Upscale) | **Neighborhood**: West Village
**VIBE**: A West Village Pan-Latin restaurant with excellent cocktails and a menu that roams from Peru to Cuba.
**BEST FOR**: date night, wine destination, reservation required, cocktail destination
**TAGS**: craft cocktails, date night, sharing plates, outdoor seating, reservation required, natural wine
**STATUS**: Rating 8.7/10 · 🔥🔥

## Mēdūza Mediterrania
**Cuisine**: Mediterranean | **Price**: $$$ (Upscale) | **Neighborhood**: Midtown
**VIBE**: A Midtown Mediterranean with a stunning blue-and-white interior and a mezze program that transports you to Santorini.
**BEST FOR**: date night, reservation required, cocktail destination
**TAGS**: sharing plates, scene, date night, craft cocktails, reservation required, seafood, outdoor seating
**STATUS**: Rating 8.7/10 · 🔥🔥

## Drunken Dumpling
**Cuisine**: Chinese | **Price**: $ (Budget) | **Neighborhood**: East Village
**VIBE**: An East Village spot famous for its knife-cut noodles and xlb-style soup dumplings eaten at communal tables.
**BEST FOR**: late night, groups, walk-in friendly, budget-friendly
**TAGS**: comfort food, walk-ins only, spicy, late night, group friendly, sharing plates, casual
**STATUS**: Rating 8.7/10 · 🔥🔥🔥

## Koccio
**Cuisine**: Italian | **Price**: $$ (Mid-range) | **Neighborhood**: West Village
**VIBE**: A West Village Italian counter with a rotating pasta menu and a natural wine list that changes weekly.
**BEST FOR**: date night, walk-in friendly, wine destination, budget-friendly
**TAGS**: pasta, walk-ins only, date night, outdoor seating, natural wine, casual, intimate
**STATUS**: Rating 8.7/10 · 🔥🔥

## Tacombi
**Cuisine**: Mexican | **Price**: $$ (Mid-range) | **Neighborhood**: West Village
**VIBE**: Breezy Mexican tacos in a converted garage — the al pastor and frozen margaritas feel like a beach escape.
**BEST FOR**: groups, budget-friendly
**TAGS**: tacos, outdoor seating, group friendly, margaritas, casual
**STATUS**: Rating 8.6/10 · 🔥🔥

## Sushi Samba
**Cuisine**: Japanese-Brazilian | **Price**: $$$ (Upscale) | **Neighborhood**: Greenwich Village
**VIBE**: Japanese-Brazilian fusion with a rooftop terrace in the West Village — the tiradito and caipirinha are the order.
**BEST FOR**: date night, rooftop/views, cocktail destination
**TAGS**: scene, date night, craft cocktails, outdoor seating, rooftop, sushi, sharing plates
**STATUS**: Rating 8.6/10 · 🔥🔥

## Beauty and Essex
**Cuisine**: American | **Price**: $$$ (Upscale) | **Neighborhood**: Lower East Side
**VIBE**: A speakeasy-style supper club hidden behind a pawnshop on the Lower East Side — theatrical and delicious.
**BEST FOR**: date night, hidden gem, reservation required, cocktail destination
**TAGS**: scene, date night, craft cocktails, reservation required, sharing plates, hidden gem
**STATUS**: Rating 8.6/10 · 🔥🔥

## Serafina Meatpacking
**Cuisine**: Italian | **Price**: $$$ (Upscale) | **Neighborhood**: Meatpacking
**VIBE**: A Meatpacking Italian with a see-and-be-seen terrace and thin-crust pizza that justifies the location.
**BEST FOR**: date night, brunch/bakery, cocktail destination
**TAGS**: pizza, scene, outdoor seating, date night, craft cocktails, brunch
**STATUS**: Rating 8.6/10 · 🔥🔥

## Bella Blu
**Cuisine**: Italian | **Price**: $$$ (Upscale) | **Neighborhood**: Upper East Side
**VIBE**: An Upper East Side Italian with a romantic garden and the kind of Northern Italian cooking that feels timeless.
**BEST FOR**: date night, reservation required
**TAGS**: pasta, date night, outdoor seating, reservation required, been here forever, scene
**STATUS**: Rating 8.6/10 · 🔥🔥

## Paco's Tacos
**Cuisine**: Mexican | **Price**: $ (Budget) | **Neighborhood**: Chelsea
**VIBE**: A Chelsea neighborhood taqueria with generous pours, good tacos, and a patio that's always full on summer nights.
**BEST FOR**: groups, walk-in friendly, budget-friendly
**TAGS**: tacos, walk-ins only, comfort food, margaritas, casual, group friendly
**STATUS**: Rating 8.5/10 · 🔥🔥


## 🇬🇧 LONDON — Additional

## Manteca
**Cuisine**: Italian | **Price**: $$$ (Upscale) | **Neighborhood**: Shoreditch
**Chef**: Chris Leach & David Carter
**ORDER**: Pig skin focaccia (the signature opener), tripe ragu pasta, whole animal dishes, nose-to-tail offal specials, natural wine
**VIBE**: Shoreditch nose-to-tail Italian with an open kitchen and serious energy. One of London's most exciting restaurants right now.
**BEST FOR**: Adventurous eaters, nose-to-tail enthusiasts, pasta lovers, natural wine with serious food
**INSIDER**: The pig skin focaccia is non-negotiable. The pasta program is extraordinary. Book well ahead — one of London's hardest reservations.
**CRED**: One of London's most critically acclaimed new restaurants. Time Out and Evening Standard top picks.

## Hawksmoor Borough
**Cuisine**: Steakhouse | **Price**: $$$$ (Fine Dining) | **Neighborhood**: Borough Market
**ORDER**: Porterhouse for two (dry-aged, sublime), bone marrow and onions, triple-cooked chips, sticky toffee pudding
**VIBE**: Borough Market location — beautiful Victorian railway arches. The best steakhouse in London, now with an incredible market setting.
**BEST FOR**: London's best steak, Borough Market area dining, client dinner, celebrating carnivores
**INSIDER**: The Borough arches are stunning. Book 3-4 weeks ahead. Yorkshire heritage beef, dry-aged in-house. The cocktail list is outstanding.
**CRED**: Consistently voted London's best steakhouse. The most beautiful Hawksmoor location.

## Ronnie Scott's
**Cuisine**: Jazz Club | **Price**: $$$ (Upscale) | **Neighborhood**: Soho
**ORDER**: Cocktails, sharing plates, anything on the menu — but you're here for the jazz, not a Michelin experience
**VIBE**: Soho jazz institution since 1959. World-class musicians every night. Dark, intimate, the soul of London nightlife.
**BEST FOR**: The best live jazz in London, date night with atmosphere, celebrating anything after 10pm
**INSIDER**: Book a table with dinner for the best experience. Standing room is cheaper but cramped. International acts play here.
**CRED**: London institution since 1959. The world's most famous jazz club.

## Hawksmoor Air Street
**Cuisine**: Steakhouse | **Price**: $$$$ (Fine Dining) | **Neighborhood**: Mayfair
**ORDER**: Porterhouse for two (dry-aged, the reason to come), bone marrow and onions, triple-cooked chips, sticky toffee pudding
**VIBE**: The greatest steakhouse in London — and possibly Britain. Gorgeous Art Deco room in Mayfair. Everything is exactly right.
**BEST FOR**: The best steak in London, client dinner, celebrating with serious carnivores, spectacular room
**INSIDER**: The Mayfair (Air Street) location is the most beautiful. Book 3-4 weeks ahead. The cocktail bar downstairs opens early. Yorkshire heritage beef, dry-aged in-house.
**CRED**: Consistently voted London's best steakhouse. Harden's and Zagat top rankings. The gold standard for British beef.

## Chiltern Firehouse
**Cuisine**: American | **Price**: $$$$ (Fine Dining) | **Neighborhood**: Marylebone
**Chef**: Nuno Mendes
**ORDER**: Scrambled eggs and smoked salmon (brunch institution), roast chicken, crab doughnuts, wagyu tartare
**VIBE**: Converted Marylebone fire station, hotel and restaurant. The most celebrity-packed room in London. Understated glamour.
**BEST FOR**: Celebrity spotting, impressive client dinner, Marylebone neighborhood luxury, brunch in London
**INSIDER**: Hotel guests get priority reservations. The brunch is the real gem. Celebrities at every table without the food being just a backdrop — it's genuinely good.
**CRED**: Consistently voted London's most glamorous restaurant. A-list celebrity haunt.

## The Devonshire
**Cuisine**: British Pub | **Price**: $$ (Mid-range) | **Neighborhood**: Soho
**ORDER**: Proper pint of cask ale, gastropub classics — pie, scotch egg, anything from the seasonal menu
**VIBE**: Soho gastropub that's been perfectly restored. London pub culture at its best — warm, buzzing, great beer and food.
**BEST FOR**: Authentic London pub experience, casual dinner, after-work drinks, Sunday roast
**INSIDER**: The beer selection is exceptional. Gets packed on Friday evenings. The dining room upstairs is quieter.
**CRED**: One of London's most beloved gastropubs.

## Thirteen at Chateau Denmark
**Cuisine**: Cocktail Bar | **Price**: $$$ (Upscale) | **Neighborhood**: Soho
**ORDER**: Cocktails designed as a theatrical menu — each drink is a story. The 'chapters' concept is unique.
**VIBE**: Hidden within Chateau Denmark, a boutique hotel in Soho. The most theatrical cocktail experience in London.
**BEST FOR**: Special occasion cocktails, date night, celebrating something, most unique bar experience in London
**INSIDER**: Book well in advance — very limited seats. The whole experience is designed as a narrative.
**CRED**: One of London's most talked-about cocktail experiences.

## Gunpowder Soho
**Cuisine**: Indian | **Price**: $$$ (Upscale) | **Neighborhood**: Soho
**ORDER**: Pulled duck with hoisin on crispy rice, venison keema with bone marrow, lamb chops, anything from the home-style Indian menu
**VIBE**: Tiny, packed, no-frills Soho Indian serving the kind of home-cooked Indian food you can't get elsewhere in London.
**BEST FOR**: Best casual Indian in London, spice lovers, quick dinner before a show, solo dining at the counter
**INSIDER**: No reservations — queue outside. Arrives early. Sister restaurant to Gunpowder in Spitalfields. Very small space.
**CRED**: Time Out London Top 50 Restaurants. Michelin Bib Gourmand recommended.

## Swift Soho
**Cuisine**: Cocktail Bar | **Price**: $$ (Mid-range) | **Neighborhood**: Soho
**ORDER**: Cocktails — two floors of exceptional drinking. Downstairs is a dark cocktail bar; upstairs is a brighter Irish whiskey-focused bar.
**VIBE**: One of the best cocktail bars in London. Irish-run, warm, completely unpretentious. The antidote to showy London bars.
**BEST FOR**: Cocktail lovers, date night, after-work drinks in Soho, whiskey enthusiasts
**INSIDER**: Two very different vibes on each floor. The downstairs bar is moody and intimate. Irish whiskey list is exceptional.
**CRED**: Consistently on London's best bars lists. Tales of the Cocktail nominee.

## Dishoom Battersea
**Cuisine**: Indian | **Price**: $$ (Mid-range) | **Neighborhood**: Battersea
**ORDER**: Bacon naan roll (if at breakfast), black dal (slow-cooked for 24 hours), house black tea chai, chicken tikka, bhel, grilled paneer
**VIBE**: Bombay Irani café transported to London. Always busy, always warm. The queues are worth it. Battersea location is spectacular.
**BEST FOR**: London's best Indian food, group dining, breakfast/brunch, anyone wanting a taste of Bombay café culture
**INSIDER**: No reservations for parties under 6. The black dal is cooked for 24 hours. Breakfast/brunch is the hidden gem. All Dishoom locations are excellent.
**CRED**: The most beloved restaurant group in London. National Restaurant Awards perennial favorite.

## Yeni
**Cuisine**: Turkish | **Price**: $$$ (Upscale) | **Neighborhood**: Soho
**Chef**: Civan Er
**ORDER**: Anatolian-inspired sharing plates, wood-roasted dishes, natural wine list curated around Turkish and Greek producers
**VIBE**: Soho modern Turkish. Warm and convivial, wood fire, serious food and natural wine. One of London's most exciting spots.
**BEST FOR**: Turkish/Anatolian food enthusiasts, natural wine lovers, sharing plates dinner, Soho date night
**INSIDER**: Chef Civan Er trained in Turkey and brings serious culinary depth. The wood fire dishes are the standouts.
**CRED**: Evening Standard Top 10 New Restaurants. One of London's most acclaimed recent openings.

## Soho Farmhouse
**Cuisine**: British | **Price**: $$$$ (Fine Dining) | **Neighborhood**: Chipping Norton
**ORDER**: Seasonal British farm-to-table — wood-roasted meats, farm vegetables, Sunday roast, weekend brunch
**VIBE**: Converted Oxfordshire farm estate — members' club vibe, lush grounds, wood-fire cooking, the ultimate weekend escape from London.
**BEST FOR**: Weekend countryside escape, special occasion, celebrating, the most beautiful dining setting in England
**INSIDER**: Members-only for the rooms, but non-members can eat in certain restaurants. The bakery and pizza barn are accessible.
**CRED**: The most coveted weekend destination for London's creative class. Soho House's crown jewel.

## Zero Sei Trattoria Romana
**Cuisine**: Roman | **Price**: $$$ (Upscale) | **Neighborhood**: Soho
**ORDER**: Roman classics — cacio e pepe (some of London's best), carbonara, amatriciana, coda alla vaccinara
**VIBE**: Soho Roman trattoria doing the classics with real authenticity. Warm, buzzy, the best Roman pasta in London.
**BEST FOR**: Roman pasta enthusiasts, date night, anyone who wants to feel in Rome for an evening
**INSIDER**: The cacio e pepe has been praised as London's best. Natural wine list focuses on Lazio producers.
**CRED**: Evening Standard and Time Out pick for best Roman food in London.

## Bob Bob Ricard
**Cuisine**: Russian-British | **Price**: $$$$ (Fine Dining) | **Neighborhood**: Soho
**ORDER**: Press for champagne button (yes, every table has one), beef Wellington, lobster mac & cheese, anything Russian-British
**VIBE**: Soho glamour with a 'Press for Champagne' button at every table. Art Deco luxury, gold everywhere, pure theater.
**BEST FOR**: Most fun dinner in London, celebrating, first date where you want to impress, anyone who loves theater
**INSIDER**: Press the button early and often. The beef Wellington is genuinely great, not just a gimmick. Reservations easy to get with enough notice.
**CRED**: London institution. Famous for the button. Featured in every 'London bucket list' guide.

## The Little Violet Door
**Cuisine**: Cocktail Bar | **Price**: $$ (Mid-range) | **Neighborhood**: Soho
**ORDER**: Garden-inspired cocktails using botanicals and house-made infusions
**VIBE**: Hidden Soho bar behind a purple door, botanical and enchanting. The most charming small bar in London.
**BEST FOR**: Date night, cocktail lovers, discovering hidden London bars
**INSIDER**: Easy to miss — look for the violet door. Small and intimate. Book ahead for evenings.
**CRED**: One of London's most beloved hidden bars.

## Chin Chin Ice Cream
**Cuisine**: Dessert | **Price**: $ (Budget) | **Neighborhood**: Soho
**ORDER**: Liquid nitrogen ice cream made to order — choose your flavour and watch it being made
**VIBE**: Soho's most fun dessert stop. Liquid nitrogen clouds, theatre, and genuinely excellent ice cream.
**BEST FOR**: Dessert after dinner, something fun with the group, anyone who loves a show
**INSIDER**: A Soho institution. The flavours rotate seasonally and are often surprising.
**CRED**: London's most famous liquid nitrogen ice cream. Time Out London favourite.

## Beati Paoli Restaurant
**Cuisine**: Sicilian | **Price**: $$$ (Upscale) | **Neighborhood**: Soho
**ORDER**: Sicilian pasta — pasta alla norma, arancini, fresh seafood preparations from the island's tradition
**VIBE**: Soho Sicilian trattoria, warm and family-spirited. Genuine regional Italian cooking.
**BEST FOR**: Sicilian food lovers, date night pasta dinner, neighbourhood Italian in Soho
**INSIDER**: The pastas are all made fresh. Natural wine list focuses on Sicilian and southern Italian producers.
**CRED**: Praised by Time Out and Evening Standard for authentic regional Italian.

## Randall & Aubin
**Cuisine**: French Seafood | **Price**: $$$ (Upscale) | **Neighborhood**: Soho
**ORDER**: Plateau de fruits de mer (the whole point), lobster, oysters on the half shell, champagne
**VIBE**: Former Victorian butcher shop turned seafood bar. White tiles, bustling energy, champagne at the counter. Soho's most fun late-night shellfish spot.
**BEST FOR**: Late night oysters and champagne, seafood lovers, after-theatre dinner, celebrating with bubbles
**INSIDER**: No reservations for the counter seats — just show up. The upstairs room takes bookings. Open late.
**CRED**: London institution. Time Out London favourite for seafood.

## The Blue Posts
**Cuisine**: British Pub | **Price**: $$ (Mid-range) | **Neighborhood**: Soho
**ORDER**: Craft cocktails, excellent bar snacks, natural wine selection
**VIBE**: Soho cocktail pub — intimate, dimly lit, serves serious drinks in an unpretentious pub setting. A neighbourhood gem.
**BEST FOR**: After-work drinks, late night in Soho, craft cocktail lovers who hate pretension
**INSIDER**: Walk-in only. Gets busy after 10pm. One of Soho's best-kept bar secrets.
**CRED**: Consistently praised by London bar press.

## Basement Sate
**Cuisine**: Cocktail Bar | **Price**: $$ (Mid-range) | **Neighborhood**: Soho
**ORDER**: Creative cocktails and dessert plates — the cocktail-and-dessert pairing concept is unique
**VIBE**: Underground Soho bar focused on cocktails paired with desserts. Unusual, fun, genuinely delicious.
**BEST FOR**: After-dinner drinks with a sweet tooth, date night, unique London bar experience
**INSIDER**: The dessert-cocktail pairing menus change seasonally. Very romantic underground space.
**CRED**: One of London's most original bar concepts.

## Pastaio Carnaby
**Cuisine**: Italian | **Price**: $$ (Mid-range) | **Neighborhood**: Soho
**VIBE**: A Carnaby Street pasta bar with rainbow-hued pastas made fresh daily — the cacio e pepe is essential.
**BEST FOR**: date night, walk-in friendly, budget-friendly
**TAGS**: pasta, walk-ins only, date night, casual, outdoor seating, comfort food
**STATUS**: Rating 8.7/10 · 🔥🔥

## Flute Bar
**Cuisine**: Champagne Bar | **Price**: $$$ (Upscale) | **Neighborhood**: Soho
**VIBE**: A Soho champagne bar where every occasion, no matter how small, deserves a glass of bubbles.
**BEST FOR**: date night, late night, walk-in friendly, cocktail destination
**TAGS**: champagne, craft cocktails, date night, walk-ins only, late night, outdoor seating
**STATUS**: Rating 8.7/10 · 🔥🔥

## Cecconi's Pizza Bar Soho
**Cuisine**: Italian | **Price**: $$$ (Upscale) | **Neighborhood**: Soho
**VIBE**: Soho House's Soho pizza bar with a brilliant terrace on Dean Street and reliably excellent Italian cooking.
**BEST FOR**: date night, brunch/bakery, cocktail destination
**TAGS**: pizza, outdoor seating, scene, date night, craft cocktails, brunch
**STATUS**: Rating 8.7/10 · 🔥🔥

## Coach & Horses
**Cuisine**: British Pub | **Price**: $ (Budget) | **Neighborhood**: Soho
**ORDER**: Pint of bitter, classic pub food if you're hungry
**VIBE**: One of Soho's most famous pubs, operating since 1847. Beloved by writers, artists, and bohemians for generations.
**BEST FOR**: Authentic old London pub experience, Soho history, the most character-filled pub in the neighbourhood
**INSIDER**: Jeffrey Bernard was a regular — this is the pub that launched a thousand drinking stories. Unchanged for decades.
**CRED**: London institution. Featured in countless books, articles, and histories of Soho bohemia.

## Girafe Restaurant
**Cuisine**: French | **Price**: $$$ (Upscale) | **Neighborhood**: Kensington
**VIBE**: A French restaurant in the Royal Albert Hall with sweeping Kensington views and an elegant brasserie menu.
**BEST FOR**: date night, rooftop/views, reservation required, cocktail destination
**TAGS**: date night, reservation required, views, outdoor seating, special occasion, craft cocktails
**STATUS**: Rating 8.7/10 · 🔥🔥

## The Duck and Rice
**Cuisine**: Chinese | **Price**: $$ (Mid-range) | **Neighborhood**: Soho
**VIBE**: A Soho pub-Chinese hybrid by Alan Yau — dim sum and craft beer in a gorgeous Victorian pub setting.
**BEST FOR**: groups, walk-in friendly, craft beer, budget-friendly
**TAGS**: dim sum, walk-ins only, group friendly, comfort food, craft beer, been here forever
**STATUS**: Rating 8.7/10 · 🔥🔥

## The Harbour Club
**Cuisine**: European | **Price**: $$$$ (Fine Dining) | **Neighborhood**: Chelsea
**VIBE**: A Chelsea Harbour restaurant with Thames views, a glamorous crowd, and cooking that justifies the postcode.
**BEST FOR**: date night, waterfront views, splurge, reservation required, cocktail destination
**TAGS**: scene, waterfront, date night, reservation required, craft cocktails, special occasion, outdoor seating
**STATUS**: Rating 8.7/10 · 🔥🔥

## Dean Street Townhouse
**Cuisine**: British | **Price**: $$$ (Upscale) | **Neighborhood**: Soho
**ORDER**: Full English breakfast, devilled kidneys, potted shrimps, British classics done with care
**VIBE**: Georgian townhouse in the heart of Soho — part hotel, part dining room. Warm, old-school British charm without being stuffy.
**BEST FOR**: Classic British breakfast or brunch, Soho neighbourhood dining, media industry lunch
**INSIDER**: Very popular with Soho's creative industry. The upstairs dining room is more intimate than the ground floor.
**CRED**: A beloved Soho institution. Consistently in Time Out London's best brunch lists.

## Mr Fogg's Tavern
**Cuisine**: British Bar | **Price**: $$ (Mid-range) | **Neighborhood**: Covent Garden
**VIBE**: A Victorian explorer-themed cocktail tavern in Covent Garden with theatrical drinks and a great atmosphere.
**BEST FOR**: date night, late night, hidden gem, walk-in friendly, budget-friendly, reservation required, cocktail destination
**TAGS**: craft cocktails, date night, hidden gem, been here forever, late night, walk-ins only
**STATUS**: Rating 8.6/10 · 🔥🔥

## Rodeo Doughnuts
**Cuisine**: Bakery | **Price**: $ (Budget) | **Neighborhood**: Soho
**VIBE**: Soho's most creative doughnut shop — flavors rotate daily and the queue is always worth it.
**BEST FOR**: brunch/bakery, walk-in friendly, budget-friendly
**TAGS**: bakery, walk-ins only, great coffee, casual, comfort food
**STATUS**: Rating 8.6/10 · 🔥🔥

## Cafe Boheme
**Cuisine**: French Brasserie | **Price**: $$ (Mid-range) | **Neighborhood**: Soho
**VIBE**: A 24-hour Old Compton Street French brasserie that serves the whole Soho spectrum at any hour of the night.
**BEST FOR**: late night, brunch/bakery, walk-in friendly, budget-friendly
**TAGS**: been here forever, late night, outdoor seating, walk-ins only, brunch, comfort food
**STATUS**: Rating 8.6/10 · 🔥🔥

## The Ganton Arms
**Cuisine**: British Pub | **Price**: $$ (Mid-range) | **Neighborhood**: Soho
**VIBE**: A proper Carnaby Street pub with real ales and the kind of no-fuss atmosphere that Soho needs more of.
**BEST FOR**: groups, walk-in friendly, craft beer, budget-friendly
**TAGS**: walk-ins only, been here forever, comfort food, craft beer, group friendly, casual
**STATUS**: Rating 8.6/10 · 🔥🔥

## Pot and Rice
**Cuisine**: Chinese | **Price**: $ (Budget) | **Neighborhood**: Soho
**VIBE**: A Soho Cantonese comfort food counter serving claypot rice that is deeply, essentially satisfying.
**BEST FOR**: late night, groups, walk-in friendly, budget-friendly
**TAGS**: comfort food, walk-ins only, spicy, late night, casual, group friendly
**STATUS**: Rating 8.6/10 · 🔥🔥🔥

## Haidilao Hot Pot Piccadilly
**Cuisine**: Chinese Hot Pot | **Price**: $$ (Mid-range) | **Neighborhood**: Soho
**VIBE**: The global hot pot phenomenon's London outpost — the theatrical tableside service and broth are both exceptional.
**BEST FOR**: late night, groups, walk-in friendly, budget-friendly
**TAGS**: group friendly, spicy, sharing plates, walk-ins only, late night, comfort food
**STATUS**: Rating 8.6/10 · 🔥🔥🔥

## 74 Duke
**Cuisine**: Bar | **Price**: $$ (Mid-range) | **Neighborhood**: Soho
**VIBE**: A Soho cocktail bar with a relaxed vibe and drinks that are consistently better than the surroundings suggest.
**BEST FOR**: date night, late night, walk-in friendly, budget-friendly, cocktail destination
**TAGS**: craft cocktails, late night, walk-ins only, outdoor seating, scene, date night
**STATUS**: Rating 8.6/10 · 🔥🔥

## Rusty Bar
**Cuisine**: Cocktail Bar | **Price**: $$ (Mid-range) | **Neighborhood**: Shoreditch
**VIBE**: A Shoreditch cocktail bar with an industrial aesthetic and reliably good drinks for a creative east London crowd.
**BEST FOR**: late night, groups, walk-in friendly, budget-friendly, cocktail destination
**TAGS**: craft cocktails, late night, walk-ins only, outdoor seating, scene, group friendly
**STATUS**: Rating 8.6/10 · 🔥🔥

## The Gin Room
**Cuisine**: Cocktail Bar | **Price**: $$ (Mid-range) | **Neighborhood**: Soho
**VIBE**: A dedicated gin bar in Soho with over 100 expressions and bartenders who know exactly how to use them.
**BEST FOR**: date night, late night, hidden gem, walk-in friendly, budget-friendly, reservation required, cocktail destination
**TAGS**: craft cocktails, gin, date night, walk-ins only, intimate, hidden gem, late night
**STATUS**: Rating 8.6/10 · 🔥🔥

## The Apothecary Cocktail Bar
**Cuisine**: Cocktail Bar | **Price**: $$ (Mid-range) | **Neighborhood**: Soho
**VIBE**: A pharmacy-themed Soho cocktail bar where the drinks are the prescription and the atmosphere is the cure.
**BEST FOR**: date night, late night, hidden gem, walk-in friendly, budget-friendly, reservation required, cocktail destination
**TAGS**: craft cocktails, date night, hidden gem, late night, walk-ins only, intimate
**STATUS**: Rating 8.6/10 · 🔥🔥

## The Nines
**Cuisine**: Bar | **Price**: $$ (Mid-range) | **Neighborhood**: Soho
**VIBE**: A Soho cocktail bar dressed to the nines with a drinks list that justifies the name.
**BEST FOR**: date night, late night, walk-in friendly, budget-friendly, cocktail destination
**TAGS**: craft cocktails, late night, outdoor seating, scene, walk-ins only, date night
**STATUS**: Rating 8.6/10 · 🔥🔥

## Old Compton Brasserie
**Cuisine**: British Brasserie | **Price**: $$$ (Upscale) | **Neighborhood**: Soho
**VIBE**: A Soho institution on Old Compton Street where the terrace is always buzzing and the martinis are cold.
**BEST FOR**: late night, brunch/bakery, cocktail destination
**TAGS**: brunch, outdoor seating, scene, craft cocktails, late night, open late
**STATUS**: Rating 8.5/10 · 🔥🔥

## JUNK Soho
**Cuisine**: Bar | **Price**: $$ (Mid-range) | **Neighborhood**: Soho
**VIBE**: A lively Soho bar with eclectic décor, strong cocktails, and a crowd that starts early and ends late.
**BEST FOR**: late night, groups, walk-in friendly, budget-friendly, cocktail destination
**TAGS**: late night, craft cocktails, walk-ins only, scene, outdoor seating, group friendly
**STATUS**: Rating 8.5/10 · 🔥🔥

## Noodle & Beer Chinatown
**Cuisine**: Chinese | **Price**: $ (Budget) | **Neighborhood**: Chinatown
**VIBE**: A Chinatown noodle bar where the hand-pulled noodles and cold Tsingtao are all you need on a late London night.
**BEST FOR**: late night, groups, walk-in friendly, budget-friendly
**TAGS**: ramen, comfort food, walk-ins only, late night, spicy, casual, group friendly
**STATUS**: Rating 8.5/10 · 🔥🔥🔥

## Alfie's Soho
**Cuisine**: Bar | **Price**: $$ (Mid-range) | **Neighborhood**: Soho
**VIBE**: A relaxed Soho bar with a great outdoor terrace and cocktails that keep the neighborhood regulars loyal.
**BEST FOR**: late night, groups, walk-in friendly, budget-friendly, cocktail destination
**TAGS**: craft cocktails, late night, walk-ins only, outdoor seating, scene, group friendly
**STATUS**: Rating 8.5/10 · 🔥🔥

## The Three Greyhounds
**Cuisine**: British Pub | **Price**: $$ (Mid-range) | **Neighborhood**: Soho
**VIBE**: A Greek Street pub with a sunny front terrace and a well-kept selection of ales and lagers.
**BEST FOR**: groups, walk-in friendly, craft beer, budget-friendly
**TAGS**: walk-ins only, outdoor seating, comfort food, craft beer, group friendly, casual
**STATUS**: Rating 8.5/10 · 🔥🔥

## 99Bar
**Cuisine**: Bar | **Price**: $ (Budget) | **Neighborhood**: Soho
**VIBE**: A Soho basement bar where cheap cocktails and no attitude make it one of the neighborhood's most democratic spots.
**BEST FOR**: late night, groups, walk-in friendly, budget-friendly, cocktail destination
**TAGS**: walk-ins only, late night, casual, craft cocktails, group friendly, outdoor seating
**STATUS**: Rating 8.5/10 · 🔥🔥

## Laika Shisha Lounge
**Cuisine**: Bar | **Price**: $$ (Mid-range) | **Neighborhood**: Soho
**VIBE**: A Soho shisha and cocktail lounge that bridges the gap between a night out and a long conversation.
**BEST FOR**: late night, groups, walk-in friendly, budget-friendly
**TAGS**: late night, outdoor seating, walk-ins only, casual, scene, group friendly
**STATUS**: Rating 8.4/10 · 🔥🔥

## Blue Sky Bar
**Cuisine**: Bar | **Price**: $$ (Mid-range) | **Neighborhood**: Soho
**VIBE**: A Soho rooftop bar with open-sky views and cocktails that improve with altitude.
**BEST FOR**: rooftop/views, late night, walk-in friendly, budget-friendly, cocktail destination
**TAGS**: rooftop, outdoor seating, craft cocktails, late night, walk-ins only, scene
**STATUS**: Rating 8.4/10 · 🔥🔥


## 🇲🇽 MEXICO CITY — Additional

## Hanky Panky Cocktail Bar 🏅
**Cuisine**: Cocktail Bar | **Price**: $$$ (Upscale) | **Neighborhood**: Colonia Roma
**ORDER**: The reservation-only tasting menu of cocktails — 8 courses, completely theatrical, world-class
**VIBE**: Hidden in Roma Norte, named after the classic cocktail. Dark, intimate, the most serious cocktail experience in Latin America.
**BEST FOR**: World-class cocktail experience, celebrating, anyone who thinks they've had the best cocktails before
**INSIDER**: Book weeks ahead — extremely limited. One of the world's top 5 bars. The name comes from the classic Savoy cocktail.
**CRED**: World's 50 Best Bars top 5. Latin America's best cocktail bar.

## Handshake Speakeasy 🏅
**Cuisine**: Cocktail Bar | **Price**: $$$ (Upscale) | **Neighborhood**: Juárez
**ORDER**: Whatever the bartenders are excited about — the cocktails here are extraordinary feats of molecular mixology
**VIBE**: Hidden behind a taco spot in Juárez, the world's most exciting cocktail bar. Smoke, liquid nitrogen, culinary cocktails that defy categories.
**BEST FOR**: World-class cocktail experience, anyone who thinks they've had great drinks before
**INSIDER**: Ring the doorbell. Very hard to get into — book weeks ahead online. World's 50 Best Bars top 5. The team are culinary geniuses.
**CRED**: World's 50 Best Bars #4 (2024). Widely considered Latin America's best bar.

## Restaurante Rosetta
**Cuisine**: Italian-Mexican | **Price**: $$$ (Upscale) | **Neighborhood**: Colonia Roma
**Chef**: Elena Reygadas
**ORDER**: The pasta dishes (Elena trained in Italy — the best pasta in Mexico City), seasonal vegetables from the garden, anything with heirloom corn
**VIBE**: A Porfirian mansion in Roma Norte, restaurant and bakery. Elena Reygadas is Mexico's most celebrated female chef. The most beautiful dining room in CDMX.
**BEST FOR**: Mexico City's most beautiful restaurant, Italian-Mexican fusion, special occasion, the best pasta in Mexico
**INSIDER**: The Panadería Rosetta bakery attached is Mexico City's most beloved. The lunch menu is superb and better value than dinner. Elena Reygadas won World's Best Female Chef.
**CRED**: World's Best Female Chef 2023 (Elena Reygadas). Latin America's 50 Best. One of Mexico's most important restaurants.

## Licorería Limantour 🏅
**Cuisine**: Cocktail Bar | **Price**: $$ (Mid-range) | **Neighborhood**: Colonia Roma
**ORDER**: Mezcal-based cocktails, house-infused spirits, anything seasonal from their evolving menu
**VIBE**: Roma Norte bar that put Mexico City on the global cocktail map. Beautiful space, exceptional drinks, always packed with Mexico City's best crowd.
**BEST FOR**: Mezcal cocktail lovers, discovering Mexico City's bar scene, date night drinks
**INSIDER**: Multiple locations but Roma Norte is the original. The mezcal program is extraordinary. One of Latin America's foundational cocktail bars.
**CRED**: World's 50 Best Bars multiple years. Latin America's most influential cocktail bar.

## Arena México
**Cuisine**: Experience | **Price**: $$ (Mid-range) | **Neighborhood**: Doctores
**ORDER**: The lucha libre experience — street food from surrounding vendors, beer, the wrestling itself
**VIBE**: The world's most famous lucha libre arena. Tuesday and Friday nights are the main events. Spectacular, loud, carnivalesque.
**BEST FOR**: Mexico City bucket list experience, groups, anyone who wants the most uniquely Mexican night out
**INSIDER**: Tuesday and Friday are the best nights. Buy tickets at the door or online. The surrounding street food is excellent.
**CRED**: One of the world's great sporting and entertainment experiences. Mexico City institution since 1956.

## Expendio de Maiz
**Cuisine**: Mexican | **Price**: $$ (Mid-range) | **Neighborhood**: Centro Histórico
**ORDER**: Whatever corn-based dishes are on the menu — everything is made from heirloom corn varieties. The tamales and tlayudas are exceptional.
**VIBE**: Tiny, market-style restaurant in the Centro Histórico focused entirely on corn. Counter seating, no pretension, profound.
**BEST FOR**: Corn and heirloom grain enthusiasts, authentic Mexican food education, Centro Histórico exploring
**INSIDER**: The entire menu celebrates Mexico's extraordinary corn biodiversity. A deeply important restaurant for understanding Mexican cuisine.
**CRED**: Featured in every serious Mexico City food guide. UNESCO-recognized corn heritage champion.

## Campobaja
**Cuisine**: Baja Seafood | **Price**: $$$ (Upscale) | **Neighborhood**: Colonia Roma
**Chef**: Emilio Callejas
**ORDER**: Baja California-style seafood, raw bar, tostadas, ceviche, tacos de camarón, natural wines from Baja
**VIBE**: Roma Norte, celebrating Baja California coastal cuisine in Mexico City. Casual, beautiful, wine-forward.
**BEST FOR**: Baja seafood lovers, natural wine drinkers, Roma Norte exploring, casual but quality seafood dinner
**INSIDER**: The natural wine list focuses heavily on Baja California producers. Excellent for a long afternoon lunch.
**CRED**: Time Out Mexico Top Restaurant. One of CDMX's most exciting seafood destinations.

## Mi Compa Chava
**Cuisine**: Mexican Seafood | **Price**: $$ (Mid-range) | **Neighborhood**: Condesa
**ORDER**: Mariscos — shrimp tacos, aguachile, ceviche, tostilocos, Michelada
**VIBE**: Condesa mariscos spot that's become a neighborhood institution. The best casual seafood tacos in Mexico City.
**BEST FOR**: Casual mariscos, lunch, best shrimp tacos in CDMX, neighborhood eating in Condesa
**INSIDER**: Walk-in, cash-friendly, always packed. The aguachile verde is the move.
**CRED**: One of CDMX's most beloved casual seafood spots.

## Chapultepec Castle
**Cuisine**: Experience | **Price**: $ (Budget) | **Neighborhood**: Polanco
**VIBE**: A 18th-century castle atop a hill in Chapultepec Park with sweeping views over Mexico City.
**BEST FOR**: rooftop/views, walk-in friendly, budget-friendly
**TAGS**: bucket list, outdoor seating, views, walk-ins only, special occasion, local legend
**STATUS**: Rating 9.1/10 · 🔥🔥🔥

## HOMARE
**Cuisine**: Japanese | **Price**: $$$$ (Fine Dining) | **Neighborhood**: Polanco
**ORDER**: Omakase — Japanese precision in the heart of Polanco. The fish is flown from Japan.
**VIBE**: Polanco omakase counter. One of the best Japanese restaurants in Latin America.
**BEST FOR**: Omakase lovers, best Japanese food in Mexico City, special occasion
**INSIDER**: The fish sourcing is extraordinary for Mexico. Counter seating, completely immersive.
**CRED**: Considered Mexico City's best Japanese restaurant.

## Masala y Maíz
**Cuisine**: Indian-Mexican | **Price**: $$ (Mid-range) | **Neighborhood**: Colonia Roma
**Chef**: Norma Listman & Saqib Keval
**ORDER**: Indian-Mexican fusion — dosas with Mexican fillings, mole-spiced Indian dishes, everything vegetarian-friendly
**VIBE**: Roma Norte fusion restaurant from a married couple — she's from Mexico, he's from India. The most surprising and delicious restaurant concept in CDMX.
**BEST FOR**: Adventurous eaters, vegetarians, the most original dining concept in Mexico City
**INSIDER**: The concept sounds gimmicky but is deeply considered and delicious. Both chefs trained seriously in their respective traditions.
**CRED**: NY Times, Bon Appétit, and every Mexico City food guide. One of CDMX's most talked-about restaurants.

## Maizajo
**Cuisine**: Mexican | **Price**: $$$ (Upscale) | **Neighborhood**: Polanco
**VIBE**: A corn-focused tasting experience that explores the full biodiversity of Mexican maíz.
**BEST FOR**: reservation required
**TAGS**: farm-to-table, corn, traditional, innovative, sharing plates, reservation required
**STATUS**: Rating 9.0/10 · 🔥🔥🔥

## Bosque de Chapultepec
**Cuisine**: Experience | **Price**: $ (Budget) | **Neighborhood**: Polanco
**VIBE**: The green lung of Mexico City — lakeside tacos, wandering vendors, and Sunday family picnics.
**BEST FOR**: groups, walk-in friendly, vegetarian-friendly, budget-friendly
**TAGS**: outdoor seating, walk-ins only, group friendly, local legend, vegan friendly, street food
**STATUS**: Rating 9.0/10 · 🔥🔥🔥

## Museo Soumaya
**Cuisine**: Experience | **Price**: $ (Budget) | **Neighborhood**: Polanco
**VIBE**: Carlos Slim's futuristic silver museum in Polanco housing an extraordinary art collection — free entry.
**BEST FOR**: rooftop/views, walk-in friendly, budget-friendly
**TAGS**: bucket list, walk-ins only, local legend, views, special occasion
**STATUS**: Rating 9.0/10 · 🔥🔥🔥

## Four Seasons Mexico City
**Cuisine**: Hotel Bar | **Price**: $$$$ (Fine Dining) | **Neighborhood**: Juárez
**VIBE**: The Paseo de la Reforma Four Seasons — the courtyard bar is one of Mexico City's great power-lunch destinations.
**BEST FOR**: date night, splurge, reservation required, cocktail destination
**TAGS**: craft cocktails, outdoor seating, scene, date night, reservation required, special occasion, hotel bar
**STATUS**: Rating 9.0/10 · 🔥🔥🔥

## Tetetlán
**Cuisine**: Mexican | **Price**: $$$$ (Fine Dining) | **Neighborhood**: Lomas de Chapultepec
**ORDER**: Pre-Hispanic Mexican cuisine — moles, huitlacoche, ancient corn preparations, mezcal pairings
**VIBE**: Lomas de Chapultepec, celebrating Mexico's pre-colonial culinary heritage. Important and delicious.
**BEST FOR**: Pre-Hispanic Mexican food education, special occasion, serious Mexican cuisine enthusiasts
**INSIDER**: One of the few restaurants seriously exploring pre-Hispanic ingredients and techniques at a fine dining level.
**CRED**: Featured in every serious Mexico City food guide.

## Birria de la 30
**Cuisine**: Mexican | **Price**: $ (Budget) | **Neighborhood**: Colonia Roma
**ORDER**: Birria tacos with consommé for dipping — that's the entire menu and it's perfect
**VIBE**: Roma Norte birria spot, walk-in, packed, the best birria in the city. Just tacos and broth.
**BEST FOR**: Best birria in Mexico City, late night after drinking, taco pilgrimage
**INSIDER**: Open late — great after bar-hopping in Roma. Dip the taco in the consommé. Cash only.
**CRED**: One of CDMX's most beloved taquería spots.

## El Cardenal Alameda
**Cuisine**: Mexican | **Price**: $$$ (Upscale) | **Neighborhood**: Centro Histórico
**ORDER**: Chilaquiles (the finest in the city), enchiladas verdes, tamales, traditional Mexican breakfast dishes, atole
**VIBE**: Traditional Mexican restaurant with decades of history. White tablecloths, formal service, old Mexico City elegance.
**BEST FOR**: Classic Mexican breakfast, traditional cuisine lovers, families, experiencing old Mexico City dining culture
**INSIDER**: Breakfast is the main event here. Go early. The chilaquiles are extraordinary. A Mexico City institution for generations.
**CRED**: Mexico City's most beloved traditional restaurant. Featured in every Mexico City food guide.

## Lardo
**Cuisine**: Italian | **Price**: $$ (Mid-range) | **Neighborhood**: Colonia Roma
**ORDER**: Wood-fired pizza (some of the best in CDMX), pasta, antipasto, Italian aperitivo selection
**VIBE**: Roma Norte Italian with a wood fire and sunny outdoor terrace. The best casual Italian in Mexico City.
**BEST FOR**: Pizza and pasta lovers, Roma Norte outdoor dining, relaxed Italian evening
**INSIDER**: The terrace is perfect for long lunches. The pizza dough is made with natural fermentation.
**CRED**: Consistently rated one of CDMX's best Italian restaurants.

## Azul Condesa
**Cuisine**: Mexican | **Price**: $$$ (Upscale) | **Neighborhood**: Condesa
**Chef**: Ricardo Muñoz Zurita
**ORDER**: Mole dishes (Ricardo is Mexico's foremost mole authority), regional Mexican dishes from across the country, cochinita pibil
**VIBE**: Condesa neighborhood, sophisticated and warm. Ricardo Muñoz Zurita is Mexico's food historian — the menu is a tour of Mexican regional cuisine.
**BEST FOR**: Deep dive into Mexican regional cuisine, mole education, serious food lovers, Condesa neighborhood dining
**INSIDER**: Ricardo Muñoz Zurita wrote the encyclopedia on Mexican cuisine. The menu showcases dishes from every region of Mexico.
**CRED**: Run by Mexico's most respected culinary historian. Essential for anyone wanting to understand Mexican cuisine's depth.

## Taquería Orinoco
**Cuisine**: Mexican | **Price**: $ (Budget) | **Neighborhood**: Polanco
**ORDER**: Norteño-style tacos — brisket, pastor, cheese, flour tortillas (rare in CDMX), consommé
**VIBE**: Polanco taquería bringing Monterrey-style tacos to the capital. Always a queue, always worth it.
**BEST FOR**: The best Norteño tacos in Mexico City, quick lunch, taco education beyond CDMX traditions
**INSIDER**: The flour tortilla tacos are unusual for CDMX — a Monterrey tradition. Multiple locations now. The brisket taco is extraordinary.
**CRED**: Time Out Mexico and every food guide's top taquería recommendation.

## Xaman Bar
**Cuisine**: Cocktail Bar | **Price**: $$ (Mid-range) | **Neighborhood**: Colonia Roma
**VIBE**: A Roma Norte bar exploring pre-Hispanic Mexican ingredients through beautifully crafted cocktails.
**BEST FOR**: date night, late night, wine destination, budget-friendly, cocktail destination
**TAGS**: craft cocktails, mezcal, date night, late night, outdoor seating, natural wine
**STATUS**: Rating 8.9/10 · 🔥🔥

## Lucha Libre Experience
**Cuisine**: Experience | **Price**: $$ (Mid-range) | **Neighborhood**: Doctores
**VIBE**: A guided evening of authentic Lucha Libre — masks, theatrics, and ice-cold beer in equal measure.
**BEST FOR**: groups, walk-in friendly, budget-friendly
**TAGS**: bucket list, group friendly, walk-ins only, special occasion, local legend
**STATUS**: Rating 8.9/10 · 🔥🔥🔥

## Hotel CondesaDF
**Cuisine**: Hotel Bar | **Price**: $$$ (Upscale) | **Neighborhood**: Condesa
**VIBE**: A converted French Porfiriato mansion with a rooftop bar that captures the best of Condesa at golden hour.
**BEST FOR**: date night, rooftop/views, cocktail destination
**TAGS**: rooftop, craft cocktails, outdoor seating, scene, date night, hotel bar, views
**STATUS**: Rating 8.9/10 · 🔥🔥🔥

## Departamento
**Cuisine**: Cocktail Bar | **Price**: $$ (Mid-range) | **Neighborhood**: Colonia Roma
**VIBE**: A Roma Norte apartment-turned-cocktail bar where the mezcal program and botanical cocktails are extraordinary.
**BEST FOR**: date night, late night, hidden gem, budget-friendly, reservation required, cocktail destination
**TAGS**: craft cocktails, mezcal, date night, late night, hidden gem, reservation required
**STATUS**: Rating 8.9/10 · 🔥🔥🔥

## Tacos Los Alexis
**Cuisine**: Mexican | **Price**: $ (Budget) | **Neighborhood**: Colonia Roma
**VIBE**: A Roma Norte late-night taco stand where the pastor and costilla are cooked on a wood-fired grill until 4am.
**BEST FOR**: late night, walk-in friendly, budget-friendly
**TAGS**: tacos, street food, walk-ins only, late night, local legend, comfort food, spicy
**STATUS**: Rating 8.9/10 · 🔥🔥🔥

## Abrasamar
**Cuisine**: Mexican Seafood | **Price**: $$$ (Upscale) | **Neighborhood**: Polanco
**VIBE**: A Polanco coastal seafood restaurant where the tostadas and ceviche showcase Mexico's Pacific coast at its finest.
**BEST FOR**: date night, reservation required, cocktail destination
**TAGS**: seafood, sharing plates, date night, reservation required, craft cocktails, innovative
**STATUS**: Rating 8.9/10 · 🔥🔥🔥

## Pizza Félix
**Cuisine**: Pizza | **Price**: $$ (Mid-range) | **Neighborhood**: Colonia Roma
**VIBE**: Thin-crust pizza and natural wine in a Roma Norte garden — Mexico City's most charming pie.
**BEST FOR**: walk-in friendly, wine destination, budget-friendly
**TAGS**: pizza, natural wine, outdoor seating, casual, walk-ins only
**STATUS**: Rating 8.8/10 · 🔥🔥

## Ahorita Cantina by Handshake
**Cuisine**: Mexican Bar | **Price**: $$ (Mid-range) | **Neighborhood**: Colonia Roma
**VIBE**: The casual cantina sibling of Handshake Speakeasy — exceptional cocktails without the reservation.
**BEST FOR**: late night, walk-in friendly, budget-friendly, cocktail destination
**TAGS**: craft cocktails, mezcal, happy hour, casual, late night, walk-ins only
**STATUS**: Rating 8.8/10 · 🔥🔥

## Salón Palomilla
**Cuisine**: Mexican Bar | **Price**: $ (Budget) | **Neighborhood**: Condesa
**VIBE**: A Condesa cantina where mezcal is poured generously and the crowd spans every generation of Mexico City.
**BEST FOR**: late night, groups, walk-in friendly, budget-friendly
**TAGS**: mezcal, late night, walk-ins only, outdoor seating, local legend, group friendly, comfort food
**STATUS**: Rating 8.8/10 · 🔥🔥🔥

## La Gruta Teotihuacan
**Cuisine**: Mexican | **Price**: $$ (Mid-range) | **Neighborhood**: San Juan Teotihuacán
**VIBE**: A restaurant inside a natural cave at the base of the Teotihuacan pyramids — the setting is truly unrepeatable.
**BEST FOR**: groups, walk-in friendly, budget-friendly
**TAGS**: special occasion, bucket list, local legend, outdoor seating, group friendly, walk-ins only
**STATUS**: Rating 8.8/10 · 🔥🔥🔥

## Aura Cocina Mexicana
**Cuisine**: Mexican | **Price**: $$$ (Upscale) | **Neighborhood**: Polanco
**VIBE**: A Polanco Mexican restaurant focusing on regional dishes and complex sauces in a refined setting.
**BEST FOR**: date night, reservation required
**TAGS**: mole, traditional, date night, reservation required, outdoor seating, sharing plates
**STATUS**: Rating 8.8/10 · 🔥🔥🔥

## Caiman
**Cuisine**: Cocktail Bar | **Price**: $$ (Mid-range) | **Neighborhood**: Colonia Roma
**VIBE**: A Roma Norte bar with an inventive cocktail program drawing from Mexican botanicals and spirits.
**BEST FOR**: date night, late night, walk-in friendly, wine destination, budget-friendly, cocktail destination
**TAGS**: craft cocktails, mezcal, date night, late night, walk-ins only, outdoor seating, natural wine
**STATUS**: Rating 8.8/10 · 🔥🔥🔥

## Toledo Rooftop
**Cuisine**: Rooftop Bar | **Price**: $$$ (Upscale) | **Neighborhood**: Centro Histórico
**VIBE**: A rooftop bar in Centro Histórico with views of the Palacio de Bellas Artes and some of the city's best cocktails.
**BEST FOR**: date night, rooftop/views, reservation required, cocktail destination
**TAGS**: rooftop, craft cocktails, outdoor seating, views, date night, reservation required, special occasion
**STATUS**: Rating 8.8/10 · 🔥🔥🔥

## Soho House Mexico City
**Cuisine**: Hotel Bar | **Price**: $$$ (Upscale) | **Neighborhood**: Colonia Roma
**VIBE**: The Roma Norte Soho House with a rooftop pool and bar that's become a hub for Mexico City's creative class.
**BEST FOR**: rooftop/views, wine destination, reservation required, cocktail destination
**TAGS**: rooftop, craft cocktails, outdoor seating, scene, reservation required, hotel bar, natural wine
**STATUS**: Rating 8.7/10 · 🔥🔥

## La Única CDMX
**Cuisine**: Mexican | **Price**: $ (Budget) | **Neighborhood**: Colonia Roma
**VIBE**: A Roma Norte taquería where the cochinita pibil and suadero tacos draw lines around the block.
**BEST FOR**: walk-in friendly, budget-friendly
**TAGS**: tacos, walk-ins only, street food, local legend, comfort food, spicy
**STATUS**: Rating 8.7/10 · 🔥🔥🔥

## Qūentin Café
**Cuisine**: Café | **Price**: $$ (Mid-range) | **Neighborhood**: Polanco
**VIBE**: A Polanco specialty coffee café with exceptional single-origin pour-overs and a beautiful garden terrace.
**BEST FOR**: brunch/bakery, walk-in friendly, vegetarian-friendly, budget-friendly
**TAGS**: great coffee, brunch, outdoor seating, walk-ins only, vegan friendly, bakery
**STATUS**: Rating 8.7/10 · 🔥🔥

## Botica Masaryk
**Cuisine**: Cocktail Bar | **Price**: $$$ (Upscale) | **Neighborhood**: Polanco
**VIBE**: A pharmacy-themed cocktail bar on Polanco's main strip with excellent mezcal cocktails and a buzzy terrace.
**BEST FOR**: date night, walk-in friendly, cocktail destination
**TAGS**: craft cocktails, mezcal, outdoor seating, happy hour, date night, walk-ins only
**STATUS**: Rating 8.7/10 · 🔥🔥

## Botánico
**Cuisine**: Bar | **Price**: $$ (Mid-range) | **Neighborhood**: Condesa
**VIBE**: A Condesa garden bar where the cocktails are built around fresh herbs, flowers, and Mexican spirits.
**BEST FOR**: date night, walk-in friendly, wine destination, budget-friendly, cocktail destination
**TAGS**: craft cocktails, outdoor seating, natural wine, date night, walk-ins only, happy hour
**STATUS**: Rating 8.7/10 · 🔥🔥

## Supra Roma Rooftop
**Cuisine**: Rooftop Bar | **Price**: $$ (Mid-range) | **Neighborhood**: Colonia Roma
**VIBE**: A Roma Norte rooftop bar with some of the best city views in Mexico City and an excellent mezcal cocktail list.
**BEST FOR**: date night, rooftop/views, late night, wine destination, budget-friendly, cocktail destination
**TAGS**: rooftop, craft cocktails, outdoor seating, views, date night, late night, natural wine
**STATUS**: Rating 8.7/10 · 🔥🔥🔥

## Pandora Rooftop
**Cuisine**: Bar | **Price**: $$ (Mid-range) | **Neighborhood**: Condesa
**VIBE**: A Condesa rooftop bar with sweeping city views and cocktails that make the sunset feel longer.
**BEST FOR**: date night, rooftop/views, late night, budget-friendly, cocktail destination
**TAGS**: rooftop, craft cocktails, outdoor seating, views, date night, late night, happy hour
**STATUS**: Rating 8.6/10 · 🔥🔥


## 🇰🇷 SEOUL — Additional

## Jungsik Seoul ⭐⭐
**Cuisine**: Modern Korean | **Price**: $$$$ (Fine Dining) | **Neighborhood**: Gangnam
**Chef**: Jungsik Yim
**ORDER**: The tasting menu — New Korean cuisine that defined a movement. Bibimbap reimagined, Korean ingredients in French-influenced preparations.
**VIBE**: Apgujeong fine dining institution. The restaurant that defined modern Korean haute cuisine.
**BEST FOR**: Historic Korean fine dining, special occasion, Seoul's most essential fine dining experience
**INSIDER**: The NYC location is equally acclaimed. Chef Yim essentially launched global interest in Korean haute cuisine.
**CRED**: Michelin 2-star in both Seoul and NYC. Launched the New Korean cuisine movement.

## ZEST Seoul ⭐
**Cuisine**: Modern Korean | **Price**: $$$$ (Fine Dining) | **Neighborhood**: Gangnam
**ORDER**: Modern Korean tasting menu — Korean ingredients elevated with French technique
**VIBE**: Gangnam modern Korean fine dining. One of Seoul's most exciting new tasting menu restaurants.
**BEST FOR**: Seoul fine dining, modern Korean cuisine, special occasion
**INSIDER**: Michelin-starred and extremely hard to book. One of Seoul's newest and most celebrated fine dining destinations.
**CRED**: Michelin Star. One of Seoul's most praised new restaurants.

## Bar Cham
**Cuisine**: Cocktail Bar | **Price**: $$ (Mid-range) | **Neighborhood**: Itaewon
**ORDER**: Creative Korean-inspired cocktails, house-infused spirits, seasonal menu
**VIBE**: Itaewon cocktail bar that's become Seoul's most beloved. Warm, inventive, genuinely world-class.
**BEST FOR**: Best cocktail bar in Seoul, date night, discovering Seoul's bar scene
**INSIDER**: One of Asia's 50 Best Bars. The Korean ingredients in cocktails are used thoughtfully, not gimmickily.
**CRED**: Asia's 50 Best Bars. Seoul's most celebrated cocktail bar.

## Deepin ⭐
**Cuisine**: Korean Fine Dining | **Price**: $$$$ (Fine Dining) | **Neighborhood**: Gangnam
**ORDER**: Modern Korean tasting menu emphasizing deep, fermented flavors
**VIBE**: Gangnam fine dining focused on Korea's fermentation and aging traditions. Profound and unique.
**BEST FOR**: Korean fermentation cuisine, tasting menu, Seoul fine dining
**INSIDER**: Unusual focus on fermented Korean ingredients. The depth of flavor is unlike most tasting menus.
**CRED**: Michelin Star. One of Seoul's most distinctive fine dining experiences.

## Avécque ⭐
**Cuisine**: French | **Price**: $$$$ (Fine Dining) | **Neighborhood**: Gangnam
**ORDER**: French-Korean tasting menu — one of Seoul's most elegant fusions
**VIBE**: Gangnam fine dining room. French classical technique applied to Korean ingredients.
**BEST FOR**: French-Korean fusion, Seoul fine dining, special occasion
**INSIDER**: One of several excellent French-influenced Korean tasting menus in Gangnam.
**CRED**: Michelin Star. Highly regarded in Seoul's fine dining scene.

## Ikseon-dong Night Pocha
**Cuisine**: Korean Street Food | **Price**: $ (Budget) | **Neighborhood**: Jongno
**ORDER**: Street food classics — tteokbokki, pajeon, makgeolli, Korean bar snacks
**VIBE**: Outdoor pojangmacha (tent bar) in the atmospheric Ikseon-dong neighbourhood. The most Korean night out possible.
**BEST FOR**: Authentic Korean street drinking culture, late night food, Ikseon-dong neighbourhood exploring
**INSIDER**: The neighbourhood fills with outdoor tents in the evening. Order makgeolli (rice wine) and eat standing.
**CRED**: The definitive Ikseon-dong experience. Featured in every Seoul travel guide.

## Gong-Gan
**Cuisine**: Korean | **Price**: $$$ (Upscale) | **Neighborhood**: Jongno
**VIBE**: A hanok-housed Korean restaurant in Ikseon-dong serving refined traditional cuisine in a gorgeous setting.
**BEST FOR**: date night, reservation required
**TAGS**: traditional, reservation required, date night, sharing plates, local legend, innovative
**STATUS**: Rating 8.9/10 · 🔥🔥🔥

## kissk
**Cuisine**: Cocktail Bar | **Price**: $$$ (Upscale) | **Neighborhood**: Gangnam
**VIBE**: A Gangnam cocktail bar with a DJ booth and a drinks program that references K-pop, art, and Korean heritage.
**BEST FOR**: date night, late night, hidden gem, reservation required, cocktail destination
**TAGS**: craft cocktails, reservation required, date night, late night, hidden gem, innovative
**STATUS**: Rating 8.9/10 · 🔥🔥🔥

## Cricket Seoul
**Cuisine**: Cocktail Bar | **Price**: $$$ (Upscale) | **Neighborhood**: Itaewon
**VIBE**: A sports-themed cocktail bar in Itaewon that's earned global recognition for its creative drinks program.
**BEST FOR**: date night, late night, hidden gem, reservation required, cocktail destination
**TAGS**: craft cocktails, date night, reservation required, hidden gem, late night, innovative
**STATUS**: Rating 8.9/10 · 🔥🔥🔥

## Carbonic Bar
**Cuisine**: Cocktail Bar | **Price**: $$$ (Upscale) | **Neighborhood**: Apgujeong
**VIBE**: The Apgujeong location of Seoul's most technically fascinating cocktail bar.
**BEST FOR**: date night, late night, hidden gem, reservation required, cocktail destination
**TAGS**: craft cocktails, reservation required, date night, innovative, hidden gem, late night
**STATUS**: Rating 8.9/10 · 🔥🔥🔥

## Carbonic Bar
**Cuisine**: Cocktail Bar | **Price**: $$$ (Upscale) | **Neighborhood**: Gangnam
**VIBE**: A sophisticated Gangnam cocktail bar with a carbonation-focused drinks program.
**BEST FOR**: date night, late night, hidden gem, reservation required, cocktail destination
**TAGS**: craft cocktails, date night, reservation required, hidden gem, late night, innovative
**STATUS**: Rating 8.8/10 · 🔥🔥

## Andongjip Son Kalguksi
**Cuisine**: Korean | **Price**: $ (Budget) | **Neighborhood**: Mapo
**ORDER**: Hand-cut kalguksu (noodle soup) — simple, perfect, the best kalguksu in Seoul
**VIBE**: Mapo neighbourhood noodle institution. Hand-cut noodles in a clear anchovy broth. Pure Korean comfort.
**BEST FOR**: Korean noodle enthusiasts, authentic Seoul comfort food, lunch
**INSIDER**: The noodles are cut by hand daily. Simple menu, extraordinary quality.
**CRED**: A Seoul local institution. Featured in every Korean food guide.

## Seoul City Wall Trail
**Cuisine**: Experience | **Price**: $ (Budget) | **Neighborhood**: Jongno
**VIBE**: A hike along the 600-year-old Joseon dynasty city walls with panoramic views of old and new Seoul.
**BEST FOR**: rooftop/views, groups, walk-in friendly, budget-friendly
**TAGS**: outdoor seating, walk-ins only, views, group friendly, local legend
**STATUS**: Rating 8.8/10 · 🔥🔥

## Grand Hyatt Seoul
**Cuisine**: Hotel Bar | **Price**: $$$$ (Fine Dining) | **Neighborhood**: Itaewon
**VIBE**: The Grand Hyatt's rooftop bar above Itaewon with panoramic Seoul views and some of the city's finest cocktails.
**BEST FOR**: date night, rooftop/views, splurge, cocktail destination
**TAGS**: rooftop, craft cocktails, scene, outdoor seating, hotel bar, views, date night
**STATUS**: Rating 8.8/10 · 🔥🔥🔥

## MOWa
**Cuisine**: Cocktail Bar | **Price**: $$$ (Upscale) | **Neighborhood**: Gangnam
**VIBE**: A Gangnam cocktail bar exploring the intersection of Korean culture and world-class bartending.
**BEST FOR**: date night, late night, hidden gem, reservation required, cocktail destination
**TAGS**: craft cocktails, reservation required, date night, late night, innovative, hidden gem
**STATUS**: Rating 8.8/10 · 🔥🔥🔥

## Horongbul
**Cuisine**: Korean Bar | **Price**: $ (Budget) | **Neighborhood**: Itaewon
**VIBE**: An Itaewon makgeolli bar lit by lanterns — the house rice wine and pajeon pairing is Seoul at its most soulful.
**BEST FOR**: groups, walk-in friendly, budget-friendly
**TAGS**: makgeolli, walk-ins only, outdoor seating, local legend, comfort food, group friendly
**STATUS**: Rating 8.8/10 · 🔥🔥🔥

## Sono Calm Jeju
**Cuisine**: Korean | **Price**: $$$ (Upscale) | **Neighborhood**: Gangnam
**VIBE**: A Jeju-island-inspired restaurant in Gangnam showcasing the extraordinary seafood and produce of Korea's south.
**BEST FOR**: date night, reservation required
**TAGS**: seafood, sharing plates, date night, reservation required, farm-to-table, innovative
**STATUS**: Rating 8.8/10 · 🔥🔥🔥

## Pine & Co
**Cuisine**: Wine Bar | **Price**: $$$ (Upscale) | **Neighborhood**: Gangnam
**VIBE**: A Gangnam natural wine bar with a thoughtful food menu and a carefully curated cellar of European bottles.
**BEST FOR**: date night, wine destination, reservation required
**TAGS**: natural wine, wine bar, date night, sharing plates, reservation required, outdoor seating
**STATUS**: Rating 8.8/10 · 🔥🔥

## Kyochon Pilbang
**Cuisine**: Korean Fried Chicken | **Price**: $ (Budget) | **Neighborhood**: Jongno
**VIBE**: The original Kyochon location in Jongno — the soy garlic wings that started a global fried chicken empire.
**BEST FOR**: late night, groups, walk-in friendly, budget-friendly
**TAGS**: comfort food, walk-ins only, local legend, spicy, group friendly, late night
**STATUS**: Rating 8.8/10 · 🔥🔥🔥

## Baekgom Makgeolli
**Cuisine**: Korean Bar | **Price**: $ (Budget) | **Neighborhood**: Mapo
**VIBE**: A legendary Mapo makgeolli house serving house-brewed rice wine with pajeon (scallion pancakes).
**BEST FOR**: groups, walk-in friendly, craft beer, budget-friendly
**TAGS**: walk-ins only, local legend, outdoor seating, group friendly, traditional, craft beer
**STATUS**: Rating 8.7/10 · 🔥🔥

## Andaz Seoul Gangnam
**Cuisine**: Hotel Bar | **Price**: $$$ (Upscale) | **Neighborhood**: Gangnam
**VIBE**: A sleek Gangnam Hyatt concept hotel with a rooftop bar that channels modern Seoul at its most polished.
**BEST FOR**: date night, rooftop/views, cocktail destination
**TAGS**: rooftop, craft cocktails, scene, hotel bar, outdoor seating, views, date night
**STATUS**: Rating 8.7/10 · 🔥🔥

## Siho
**Cuisine**: Korean | **Price**: $$ (Mid-range) | **Neighborhood**: Mapo
**VIBE**: A Mapo restaurant specializing in traditional Korean home-cooking — the kimchi stew is the gold standard.
**BEST FOR**: walk-in friendly, budget-friendly
**TAGS**: traditional, walk-ins only, sharing plates, comfort food, makgeolli, local legend
**STATUS**: Rating 8.7/10 · 🔥🔥

## Cobbler
**Cuisine**: Cocktail Bar | **Price**: $$ (Mid-range) | **Neighborhood**: Itaewon
**VIBE**: An Itaewon cocktail bar known for its house-made shrubs and fruit-forward cocktails.
**BEST FOR**: date night, late night, hidden gem, walk-in friendly, budget-friendly, reservation required, cocktail destination
**TAGS**: craft cocktails, late night, walk-ins only, date night, hidden gem, intimate
**STATUS**: Rating 8.7/10 · 🔥🔥

## Team TYMM
**Cuisine**: Bar | **Price**: $$ (Mid-range) | **Neighborhood**: Itaewon
**VIBE**: A beloved Itaewon bar collective with rotating DJ sets and a crowd that defines Seoul's late-night culture.
**BEST FOR**: late night, groups, walk-in friendly, budget-friendly, cocktail destination
**TAGS**: craft cocktails, late night, walk-ins only, scene, group friendly, outdoor seating
**STATUS**: Rating 8.7/10 · 🔥🔥

## Cheerful Drinking Table
**Cuisine**: Korean Bar | **Price**: $ (Budget) | **Neighborhood**: Jongno
**VIBE**: A Jongno pojangmacha with some of Seoul's best makgeolli, served alongside excellent fried chicken.
**BEST FOR**: groups, walk-in friendly, budget-friendly
**TAGS**: makgeolli, walk-ins only, outdoor seating, group friendly, comfort food, local legend
**STATUS**: Rating 8.7/10 · 🔥🔥🔥

## Via Toledo Pasta Bar
**Cuisine**: Italian | **Price**: $$ (Mid-range) | **Neighborhood**: Mapo
**VIBE**: An Italian pasta bar in Seoul's Mapo neighborhood — the carbonara and amatriciana are unexpectedly excellent.
**BEST FOR**: date night, walk-in friendly, budget-friendly
**TAGS**: pasta, walk-ins only, date night, casual, comfort food, innovative
**STATUS**: Rating 8.7/10 · 🔥🔥

## Bar Tea Scent
**Cuisine**: Cocktail Bar | **Price**: $$ (Mid-range) | **Neighborhood**: Jongno
**VIBE**: A Jongno cocktail bar built around traditional Korean teas — the jasmine martini is unlike anything else.
**BEST FOR**: date night, late night, hidden gem, budget-friendly, reservation required, cocktail destination
**TAGS**: craft cocktails, hidden gem, date night, late night, tea, innovative
**STATUS**: Rating 8.7/10 · 🔥🔥

## Cho Kwang 201
**Cuisine**: Korean | **Price**: $ (Budget) | **Neighborhood**: Mapo
**VIBE**: A Mapo comfort food institution — the braised pork belly and side dishes draw regulars from across Seoul.
**BEST FOR**: groups, walk-in friendly, budget-friendly
**TAGS**: walk-ins only, comfort food, local legend, traditional, sharing plates, group friendly
**STATUS**: Rating 8.7/10 · 🔥🔥🔥

## Komfy
**Cuisine**: Café | **Price**: $ (Budget) | **Neighborhood**: Mapo
**VIBE**: A Mapo café with exceptional specialty coffee and a relaxed vibe that makes it a neighborhood anchor.
**BEST FOR**: brunch/bakery, walk-in friendly, vegetarian-friendly, budget-friendly
**TAGS**: great coffee, brunch, walk-ins only, outdoor seating, casual, vegan friendly
**STATUS**: Rating 8.6/10 · 🔥🔥

## Wooga
**Cuisine**: Korean | **Price**: $$ (Mid-range) | **Neighborhood**: Itaewon
**VIBE**: An Itaewon Korean comfort food spot beloved for its hearty stews and the warmth of its staff.
**BEST FOR**: late night, groups, walk-in friendly, budget-friendly
**TAGS**: comfort food, sharing plates, walk-ins only, group friendly, late night, makgeolli
**STATUS**: Rating 8.6/10 · 🔥🔥

## 29 Dohwa-gil
**Cuisine**: Korean | **Price**: $$ (Mid-range) | **Neighborhood**: Mapo
**VIBE**: A Mapo neighborhood Korean restaurant where traditional recipes and neighborhood pride are equally on the menu.
**BEST FOR**: walk-in friendly, budget-friendly
**TAGS**: traditional, walk-ins only, comfort food, sharing plates, local legend, outdoor seating
**STATUS**: Rating 8.6/10 · 🔥🔥

## Ggupdang Sinsa
**Cuisine**: Korean Dessert | **Price**: $ (Budget) | **Neighborhood**: Gangnam
**VIBE**: A Sinsa dessert café known for its shaved ice bingsu and fresh-baked pastries with queue-worthy status.
**BEST FOR**: brunch/bakery, walk-in friendly, budget-friendly
**TAGS**: walk-ins only, great coffee, brunch, casual, outdoor seating, comfort food
**STATUS**: Rating 8.6/10 · 🔥🔥

## Sound Planet
**Cuisine**: Bar | **Price**: $$ (Mid-range) | **Neighborhood**: Itaewon
**VIBE**: An Itaewon music bar with outdoor terraces and a DJ lineup that covers the full spectrum of Seoul's nightlife.
**BEST FOR**: late night, groups, walk-in friendly, budget-friendly, cocktail destination
**TAGS**: late night, walk-ins only, scene, group friendly, outdoor seating, craft cocktails
**STATUS**: Rating 8.5/10 · 🔥🔥


## 🌊 SAN DIEGO — Additional

## Lilo
**Cuisine**: Californian | **Price**: $$$ (Upscale) | **Neighborhood**: Little Italy
**VIBE**: A chef-driven California spot in Little Italy with a beautiful terrace and produce-focused cooking.
**BEST FOR**: date night, wine destination
**TAGS**: sharing plates, natural wine, date night, outdoor seating, farm-to-table
**STATUS**: Rating 8.8/10 · 🔥🔥

## Fall Brewing Company
**Cuisine**: Brewery | **Price**: $ (Budget) | **Neighborhood**: North Park
**VIBE**: A beloved North Park neighborhood brewery with a great patio and excellent IPAs.
**BEST FOR**: groups, walk-in friendly, craft beer, budget-friendly
**TAGS**: craft beer, outdoor seating, walk-ins only, local legend, casual, group friendly
**STATUS**: Rating 8.6/10 · 🔥🔥

## Abnormal Beer Co.
**Cuisine**: Brewery | **Price**: $ (Budget) | **Neighborhood**: Rancho Bernardo
**VIBE**: A Rancho Bernardo brewery known for barrel-aged beers and a surprisingly good food program.
**BEST FOR**: groups, walk-in friendly, craft beer, budget-friendly
**TAGS**: craft beer, outdoor seating, group friendly, walk-ins only, happy hour, food
**STATUS**: Rating 8.5/10 · 🔥🔥

## Aztec Brewing Company
**Cuisine**: Brewery | **Price**: $ (Budget) | **Neighborhood**: Vista
**VIBE**: One of San Diego's oldest brewing names, revived with a Vista taproom and classic craft recipes.
**BEST FOR**: groups, walk-in friendly, craft beer, budget-friendly
**TAGS**: craft beer, outdoor seating, group friendly, walk-ins only, happy hour, been here forever
**STATUS**: Rating 8.4/10 · 🔥🔥

## Carlsbad Brewing Company
**Cuisine**: Brewery | **Price**: $ (Budget) | **Neighborhood**: Carlsbad
**VIBE**: A coastal Carlsbad brewery with ocean breezes, a big patio, and well-made American craft ales.
**BEST FOR**: groups, walk-in friendly, craft beer, waterfront views, budget-friendly
**TAGS**: craft beer, outdoor seating, waterfront, group friendly, walk-ins only, happy hour
**STATUS**: Rating 8.4/10 · 🔥🔥

## Metabolic Brewing Co.
**Cuisine**: Brewery | **Price**: $ (Budget) | **Neighborhood**: Escondido
**VIBE**: An Escondido microbrewery known for experimental small-batch ales and IPAs.
**BEST FOR**: groups, walk-in friendly, craft beer, budget-friendly
**TAGS**: craft beer, outdoor seating, group friendly, walk-ins only, casual
**STATUS**: Rating 8.3/10 · 🔥🔥

## Ataraxia Aleworks
**Cuisine**: Brewery | **Price**: $ (Budget) | **Neighborhood**: San Marcos
**VIBE**: A San Marcos brewery focused on European-style lagers and hazy IPAs in a cozy tasting room.
**BEST FOR**: groups, walk-in friendly, craft beer, budget-friendly
**TAGS**: craft beer, outdoor seating, walk-ins only, group friendly, casual
**STATUS**: Rating 8.3/10 · 🔥🔥

## Black Plague Brewing
**Cuisine**: Brewery | **Price**: $ (Budget) | **Neighborhood**: Oceanside
**VIBE**: An Oceanside brewery with dark humor branding and seriously good hazy and sour ales.
**BEST FOR**: groups, walk-in friendly, craft beer, budget-friendly
**TAGS**: craft beer, outdoor seating, walk-ins only, casual, group friendly
**STATUS**: Rating 8.3/10 · 🔥🔥

## Creative Creature Brewing
**Cuisine**: Brewery | **Price**: $ (Budget) | **Neighborhood**: San Diego
**VIBE**: A San Diego microbrewery celebrating imagination and craft with a rotating tap of inventive styles.
**BEST FOR**: groups, walk-in friendly, craft beer, budget-friendly
**TAGS**: craft beer, outdoor seating, walk-ins only, group friendly, casual
**STATUS**: Rating 8.3/10 · 🔥🔥

## Helix Brewing Co.
**Cuisine**: Brewery | **Price**: $ (Budget) | **Neighborhood**: La Mesa
**VIBE**: A La Mesa craft brewery with a science-themed identity and well-executed West Coast IPAs.
**BEST FOR**: groups, walk-in friendly, craft beer, budget-friendly
**TAGS**: craft beer, outdoor seating, walk-ins only, group friendly, casual
**STATUS**: Rating 8.3/10 · 🔥🔥

## Night Parade Brewing
**Cuisine**: Brewery | **Price**: $ (Budget) | **Neighborhood**: San Diego
**VIBE**: A San Diego brewery inspired by Japanese folklore with creative lagers and hazy ales.
**BEST FOR**: late night, walk-in friendly, craft beer, budget-friendly
**TAGS**: craft beer, walk-ins only, casual, outdoor seating, late night
**STATUS**: Rating 8.3/10 · 🔥🔥

## Burning Bridge Brewing
**Cuisine**: Brewery | **Price**: $ (Budget) | **Neighborhood**: Chula Vista
**VIBE**: A Chula Vista craft brewery with a rotating tap list and a laid-back beer garden vibe.
**BEST FOR**: groups, walk-in friendly, craft beer, budget-friendly
**TAGS**: craft beer, outdoor seating, group friendly, walk-ins only, happy hour, casual
**STATUS**: Rating 8.2/10 · 🔥🔥

## Arcana Brewing Company
**Cuisine**: Brewery | **Price**: $ (Budget) | **Neighborhood**: Santee
**VIBE**: A Santee craft brewery with a fantasy-themed tap list and a welcoming tasting room.
**BEST FOR**: groups, walk-in friendly, craft beer, budget-friendly
**TAGS**: craft beer, outdoor seating, walk-ins only, group friendly, casual
**STATUS**: Rating 8.2/10 · 🔥🔥

## Artifex on Freeman
**Cuisine**: Brewery | **Price**: $ (Budget) | **Neighborhood**: El Cajon
**VIBE**: A craft brewery in El Cajon with an art-forward aesthetic and rotating seasonal taps.
**BEST FOR**: walk-in friendly, craft beer, budget-friendly
**TAGS**: craft beer, walk-ins only, casual, outdoor seating
**STATUS**: Rating 8.2/10 · 🔥🔥

## Black Plague Purgatory Lounge
**Cuisine**: Brewery Bar | **Price**: $ (Budget) | **Neighborhood**: Oceanside
**VIBE**: The cocktail-focused sibling of Black Plague Brewing — beer cocktails, spirits, and late-night vibes.
**BEST FOR**: late night, walk-in friendly, craft beer, budget-friendly
**TAGS**: craft beer, late night, walk-ins only, cocktails, casual
**STATUS**: Rating 8.2/10 · 🔥🔥

## Citizen Brewers
**Cuisine**: Brewery | **Price**: $ (Budget) | **Neighborhood**: San Diego
**VIBE**: A community-minded San Diego brewery focused on sessionable, food-friendly craft beers.
**BEST FOR**: walk-in friendly, craft beer, budget-friendly
**TAGS**: craft beer, walk-ins only, casual, community, outdoor seating
**STATUS**: Rating 8.2/10 · 🔥🔥

## Embolden Beer Co.
**Cuisine**: Brewery | **Price**: $ (Budget) | **Neighborhood**: San Diego
**VIBE**: A bold San Diego brewery focused on pushing style boundaries without losing drinkability.
**BEST FOR**: walk-in friendly, craft beer, budget-friendly
**TAGS**: craft beer, walk-ins only, casual, outdoor seating
**STATUS**: Rating 8.2/10 · 🔥🔥

## Ketch Brewing
**Cuisine**: Brewery | **Price**: $ (Budget) | **Neighborhood**: San Diego
**VIBE**: A nautical-themed San Diego brewpub with a full kitchen and a solid lineup of maritime-inspired ales.
**BEST FOR**: walk-in friendly, craft beer, budget-friendly
**TAGS**: craft beer, walk-ins only, casual, outdoor seating, nautical
**STATUS**: Rating 8.2/10 · 🔥🔥

## Quantum Brewing
**Cuisine**: Brewery | **Price**: $ (Budget) | **Neighborhood**: San Diego
**VIBE**: A science-inspired San Diego microbrewery with experimental small-batch beers and a fun tap list.
**BEST FOR**: groups, walk-in friendly, craft beer, budget-friendly
**TAGS**: craft beer, walk-ins only, casual, science, group friendly
**STATUS**: Rating 8.2/10 · 🔥🔥

## Three Frogs Beer Company
**Cuisine**: Brewery | **Price**: $ (Budget) | **Neighborhood**: San Diego
**VIBE**: A fun, community-focused San Diego brewery with an easygoing tap list and regular events.
**BEST FOR**: groups, walk-in friendly, craft beer, budget-friendly
**TAGS**: craft beer, walk-ins only, casual, group friendly
**STATUS**: Rating 8.2/10 · 🔥🔥

## Two Tracks Cellars
**Cuisine**: Brewery | **Price**: $ (Budget) | **Neighborhood**: El Cajon
**VIBE**: A laid-back East County brewery and tasting room with a rotating selection of craft ales.
**BEST FOR**: groups, walk-in friendly, craft beer, budget-friendly
**TAGS**: craft beer, walk-ins only, casual, group friendly
**STATUS**: Rating 8.1/10 · Very Hot

## Backyard Brewery
**Cuisine**: Brewery | **Price**: $ (Budget) | **Neighborhood**: Lemon Grove
**VIBE**: A neighborhood Lemon Grove brewery with a true backyard feel and cold, honest craft beer.
**BEST FOR**: groups, walk-in friendly, craft beer, budget-friendly
**TAGS**: craft beer, outdoor seating, group friendly, walk-ins only, casual
**STATUS**: Rating 8.1/10 · Very Hot

## Blue Fire Brewing
**Cuisine**: Brewery | **Price**: $ (Budget) | **Neighborhood**: El Cajon
**VIBE**: A small East County brewery pouring approachable craft ales in a no-frills tasting room.
**BEST FOR**: groups, walk-in friendly, craft beer, budget-friendly
**TAGS**: craft beer, walk-ins only, casual, group friendly
**STATUS**: Rating 8.1/10 · Very Hot

## Groundswell Brew Tasting Room
**Cuisine**: Brewery | **Price**: $ (Budget) | **Neighborhood**: Chula Vista
**VIBE**: A Chula Vista craft brewery tasting room with a rotating selection of approachable ales.
**BEST FOR**: groups, walk-in friendly, craft beer, budget-friendly
**TAGS**: craft beer, walk-ins only, casual, group friendly
**STATUS**: Rating 8.1/10 · Very Hot

## Smoking Cannon Brewery
**Cuisine**: Brewery | **Price**: $ (Budget) | **Neighborhood**: Santee
**VIBE**: A Santee neighborhood brewery pouring reliably good craft ales in a welcoming space.
**BEST FOR**: groups, walk-in friendly, craft beer, budget-friendly
**TAGS**: craft beer, walk-ins only, casual, group friendly, outdoor seating
**STATUS**: Rating 8.1/10 · Very Hot


## 🌬️ CHICAGO — Additional

## The Violet Hour
**Cuisine**: Cocktail Bar | **Price**: $$$ (Upscale) | **Neighborhood**: Wicker Park
**ORDER**: No menu — the bartenders craft seasonal cocktails. Tell them your preferences and they'll build something perfect.
**VIBE**: Wicker Park speakeasy behind an unmarked door. Dark blue velvet, hushed, serious about cocktails. The most atmospheric bar in Chicago.
**BEST FOR**: Cocktail lovers, date night, celebrating, anyone who wants the best bar experience in Chicago
**INSIDER**: No sign on the door — look for a wall mural and a door. No standing, no shots, no PBR. Strict rules but worth it.
**CRED**: Tales of the Cocktail award winner. Consistently one of America's best bars. Launched Chicago's craft cocktail scene.

## Mfk. Restaurant
**Cuisine**: Spanish | **Price**: $$$ (Upscale) | **Neighborhood**: Lakeview
**Chef**: Nathaniel Meads
**ORDER**: The Spanish-influenced menu — boquerones, jamón, razor clams, seasonal small plates, natural wine list that's extraordinary
**VIBE**: Intimate Lakeview wine bar-restaurant with Spanish heart. One of Chicago's quietest gems. Natural wine list is world-class.
**BEST FOR**: Natural wine obsessives, date night, Spanish food lovers, a quiet special evening in Chicago
**INSIDER**: The wine list has won national recognition — ask for guidance. Small, romantic, reservation recommended.
**CRED**: Named one of America's best wine bars. Chicago Magazine top pick.

## Girl & The Goat
**Cuisine**: American | **Price**: $$$ (Upscale) | **Neighborhood**: West Loop
**Chef**: Stephanie Izard
**ORDER**: Wood-roasted pig face (the signature, don't be scared), goat liver mousse, wood-roasted vegetables, anything with goat
**VIBE**: West Loop, loud and packed, wood fire going, group feasting energy. Stephanie Izard's flagship is a celebration.
**BEST FOR**: Groups, adventurous eaters, celebrating, Chicago's most fun large-format dinner
**INSIDER**: Stephanie Izard was Top Chef winner. One of Chicago's hardest reservations. Order the pig face — it's the best thing on the menu.
**CRED**: James Beard Best Chef Great Lakes. One of Chicago's most beloved restaurants.

## Nadu
**Cuisine**: Indian | **Price**: $$$ (Upscale) | **Neighborhood**: West Loop
**ORDER**: South Indian tasting menu — dosas, curries, and dishes rarely seen outside Tamil Nadu, all executed at fine dining level
**VIBE**: West Loop South Indian tasting menu. Chicago's most exciting Indian restaurant by far.
**BEST FOR**: South Indian food enthusiasts, tasting menu lovers, Chicago's most interesting dinner
**INSIDER**: Completely unique in Chicago — no other restaurant is doing South Indian at this level. Book ahead.
**CRED**: One of Chicago's most celebrated new restaurants.


## 🗼 TOKYO — Additional

## Sukiyabashi Jiro Honten ⭐⭐⭐
**Cuisine**: Sushi | **Price**: $$$$ (Fine Dining) | **Neighborhood**: Ginza
**Chef**: Jiro Ono
**ORDER**: The omakase — 20 pieces, about 30 minutes, pure mastery. Each nigiri served immediately after cutting.
**VIBE**: Ten seats in a Ginza basement. No décor to speak of. The entire experience is about the fish. The most focused restaurant on earth.
**BEST FOR**: Once-in-a-lifetime sushi pilgrimage, anyone who has seen Jiro Dreams of Sushi
**INSIDER**: Reservations require a hotel concierge or insider contact — nearly impossible for individuals. Obama ate here. The whole experience is ~30 min. No photos during service.
**CRED**: Michelin 3-star. Subject of acclaimed documentary 'Jiro Dreams of Sushi.' Widely considered the greatest sushi restaurant in the world.

## Tempura Kondo ⭐⭐
**Cuisine**: Tempura | **Price**: $$$$ (Fine Dining) | **Neighborhood**: Ginza
**Chef**: Fumio Kondo
**ORDER**: Omakase tempura — the sweet potato (cooked 15 minutes) is legendary, sea urchin in shiso, seasonal vegetables, shrimp
**VIBE**: 8-seat counter in Ginza, watching a master at work. The most refined tempura in the world. Kondo's technique is flawless.
**BEST FOR**: Tempura pilgrimage, counter omakase lovers, Tokyo fine dining bucket list
**INSIDER**: Reserve weeks in advance. The sweet potato takes 15 minutes to cook and is served at the end — do not skip it. Kondo is often compared to Jiro for his mastery of a single technique.
**CRED**: Michelin 2-star. Considered the world's finest tempura restaurant.


## 🗼 PARIS — Additional

## L'Ami Louis
**Cuisine**: French Bistro | **Price**: $$$$ (Fine Dining) | **Neighborhood**: Marais
**ORDER**: Roast chicken (legendary — the most expensive and arguably best in Paris), foie gras, snails, pommes frites cooked in duck fat
**VIBE**: Unreconstructed old Paris bistro from 1924. Black walls, cramped tables, deliberately antiquated. Has never changed and never should.
**BEST FOR**: Old Paris authenticity, bucket list Paris experience, anyone who wants to eat like Hemingway (he came here)
**INSIDER**: Very expensive for what it is — the roast chicken is famously priced. But the quality is real. American presidents, celebrities, and food pilgrims all come here.
**CRED**: Operating since 1924, unchanged. Described by AJ Liebling in his New Yorker pieces. One of the world's most famous bistros.

## Le Jules Verne ⭐
**Cuisine**: French | **Price**: $$$$ (Fine Dining) | **Neighborhood**: 7th Arrondissement
**Chef**: Frédéric Anton
**ORDER**: The tasting menu — Frédéric Anton's classical French cuisine with the Eiffel Tower as backdrop. The roasted langoustine and duck foie gras dishes are the standouts.
**VIBE**: On the second floor of the Eiffel Tower. The view is the main event; the food is genuinely excellent. Romantic Paris at its most extreme.
**BEST FOR**: Ultimate Paris romantic dinner, proposal, celebrating something enormous, the Eiffel Tower experience
**INSIDER**: Reserve the window table when booking — the view at sunset is unforgettable. Book 2-3 months in advance. The private elevator access is part of the experience.
**CRED**: Michelin Star. The most romantic restaurant in Paris, and possibly the world.


## 🇪🇸 BARCELONA — Additional

## Quimet & Quimet
**Cuisine**: Tapas | **Price**: $ (Budget) | **Neighborhood**: Poble Sec
**ORDER**: Conservas montaditos (canned seafood on bread — sounds simple, tastes incredible), cockles with mayo and capers, tinned clams with caviar, house vermouth
**VIBE**: Standing room only, can barely fit 20 people, serving tinned seafood on bread. The most beloved bodega in Barcelona. Authentic beyond measure.
**BEST FOR**: Most authentic Barcelona tapas experience, standing bar culture, tinned seafood enthusiasts, aperitivo
**INSIDER**: Open only at lunch on weekdays and Saturday. Standing only. Order montaditos aggressively — the house combinations are brilliant.
**CRED**: Featured in every serious Barcelona food guide. A pilgrimage destination for global food writers.

## Bar Mut
**Cuisine**: Catalan Tapas | **Price**: $$ (Mid-range) | **Neighborhood**: Eixample
**ORDER**: Croquetas, jamón ibérico, tortilla española, anchovies, Catalan charcuterie, vermouth at the bar
**VIBE**: Elegant Eixample bar and restaurant. Art Nouveau interior, excellent vermut (vermouth), locals and sophisticates. One of Barcelona's great bar experiences.
**BEST FOR**: Barcelona bar culture, pre-dinner vermut, upscale tapas, Eixample exploring
**INSIDER**: The vermouth hour (12-2pm) is the authentic experience. Sit at the bar for the best energy.
**CRED**: Considered one of Barcelona's best tapas bars by every serious food guide.

## Bar Calders
**Cuisine**: Catalan Bar | **Price**: $ (Budget) | **Neighborhood**: Sant Antoni
**ORDER**: Vermut (Barcelona's best vermouth selection), montaditos, croquetas, anything fried
**VIBE**: Sant Antoni neighbourhood bar, outdoor terrace, young local crowd. The epicenter of the vermut revival in Barcelona.
**BEST FOR**: Authentic Barcelona bar culture, Sunday vermut tradition, neighbourhood exploring in Sant Antoni
**INSIDER**: Sunday mornings are the quintessential experience. The neighbourhood has gentrified around this bar.
**CRED**: One of Barcelona's most beloved neighbourhood bars.


## 🇩🇰 COPENHAGEN — Additional

## noma ⭐⭐
**Cuisine**: New Nordic | **Price**: $$$$ (Fine Dining) | **Neighborhood**: Christianshavn
**Chef**: René Redzepi
**ORDER**: The full tasting menu — whatever season you visit defines everything. Ocean, vegetable, or game & forest. All extraordinary.
**VIBE**: Repurposed warehouse on Christianshavn harbour. The most influential restaurant of the 21st century. 20 courses, 4+ hours, life-changing.
**BEST FOR**: The most important restaurant in the world, bucket list dining, anyone who loves food
**INSIDER**: Announced closing to pivot to food lab model — verify current status before booking. When open: reservation lottery on their website. Non-alcoholic pairing is one of the best in the world.
**CRED**: World's #1 Restaurant 4 times. Michelin 2-star. Defined New Nordic cuisine and changed how the world eats.

## Kadeau ⭐⭐
**Cuisine**: New Nordic | **Price**: $$$ (Upscale) | **Neighborhood**: Vesterbro
**Chef**: Nicolai Nørregaard
**ORDER**: The tasting menu — ingredients from Bornholm island, preserved and fermented through New Nordic techniques. Some of the most beautiful cooking in Scandinavia.
**VIBE**: Intimate and refined. The Bornholm-focused menu is deeply personal and seasonal. One of Copenhagen's quietest and most moving restaurants.
**BEST FOR**: Alternative to Noma, New Nordic enthusiasts, special occasion, Copenhagen fine dining
**INSIDER**: Nicolai Nørregaard grew up on Bornholm and the menu reflects that island's extraordinary larder. The non-alcoholic pairing is excellent.
**CRED**: Michelin 2-star. One of Copenhagen's most beloved fine dining destinations.


## 🌁 SAN FRANCISCO — Additional

## Benu ⭐⭐⭐
**Cuisine**: Korean-Californian | **Price**: $$$$ (Fine Dining) | **Neighborhood**: SoMa
**Chef**: Corey Lee
**ORDER**: The tasting menu — Corey Lee's Korean-influenced modern cuisine is San Francisco's most intellectually exciting dining. The thousand-year-old quail egg and the oyster with kimchi mignonette are legends.
**VIBE**: SoMa, quiet and precise. The room is restrained; the food is everything. Korean-American tasting menu at its absolute apex.
**BEST FOR**: San Francisco's best tasting menu, Korean fine dining evolution, milestone celebration
**INSIDER**: Corey Lee trained at The French Laundry. Reservations via Tock. The wine list is extraordinary. One of only 3 Michelin 3-star restaurants in SF.
**CRED**: Michelin 3-star. World's 50 Best. James Beard Best Chef West Coast. San Francisco's most important restaurant.

## State Bird Provisions ⭐
**Cuisine**: Californian | **Price**: $$$ (Upscale) | **Neighborhood**: NoPa
**Chef**: Stuart Brioza & Nicole Krasinski
**ORDER**: State bird with provisions (quail with crème fraîche pancake — the dish the restaurant is named for), anything from the dim sum carts, whatever specials the servers are carrying
**VIBE**: Dim sum–style service in a Western bistro setting. Carts roll by with dishes you flag down. Loud, lively, completely original.
**BEST FOR**: San Francisco's most fun dining experience, groups, adventurous eaters, the unique format lovers
**INSIDER**: Reservations on Tock, but walk-ins are possible when they open. The connected restaurant The Progress has a similar spirit. Flag down every cart — you won't regret it.
**CRED**: Michelin Star. James Beard Best New Restaurant 2013. Named one of America's best restaurants.

## Zuni Café 🏆
**Cuisine**: Californian | **Price**: $$$ (Upscale) | **Neighborhood**: Hayes Valley
**Chef**: Judy Rodgers legacy
**ORDER**: Roast chicken for two with bread salad (45-60 min wait, order immediately), house-cured anchovies, burgers, oysters, Campari cocktails
**VIBE**: Market Street institution since 1979. Warm wood, buzzing energy, copper bar. San Francisco at its most quintessential.
**BEST FOR**: San Francisco classic experience, the best roast chicken in America, long lunches, celebrating anything
**INSIDER**: Order the chicken when you sit down — it takes 45 minutes. The brick oven is visible from most tables.
**CRED**: James Beard America's Classics. The most important restaurant in San Francisco culinary history.

## La Taqueria 🏆
**Cuisine**: Mexican | **Price**: $ (Budget) | **Neighborhood**: Mission
**Chef**: Miguel Jara
**ORDER**: Carnitas super burrito (no rice — more beans and meat instead), carnitas taco, horchata
**VIBE**: Mission District institution since 1973. No frills, formica tables, the greatest burrito you'll ever eat.
**BEST FOR**: The definitive SF burrito, Mission District lunch, anyone debating whether SF or LA has better Mexican food (SF wins here)
**INSIDER**: Order without rice (doble) — you get extra beans and meat instead. Cash-friendly. James Beard Award winner.
**CRED**: James Beard America's Classics Award. The most discussed burrito in America.

## Tartine Manufactory
**Cuisine**: Bakery | **Price**: $$ (Mid-range) | **Neighborhood**: Mission
**Chef**: Chad Robertson
**ORDER**: Country bread (the most famous loaf in America), morning bun, croque madame, grain bowls, the seasonal pastry whatever it is
**VIBE**: Mission District bread temple. Enormous, airy, with a wood oven and serious coffee. The bakery that changed American bread.
**BEST FOR**: World's best sourdough, morning visit, coffee and pastry, SF food pilgrimage
**INSIDER**: The bread sells out — come early or order online. Chad Robertson's original Tartine Bakery nearby has even longer lines. The ice cream is also extraordinary.
**CRED**: Chad Robertson's bread is in the Smithsonian of food culture. AFAR Travel Award. Every food publication's SF essential.


## 🇵🇹 LISBON — Additional

## Taberna da Rua das Flores
**Cuisine**: Portuguese | **Price**: $$ (Mid-range) | **Neighborhood**: Chiado
**Chef**: André Magalhães
**ORDER**: Whatever the daily specials are — this is market-driven, old-fashioned Portuguese cooking at its finest. Petiscos (Portuguese tapas), liver, seasonal fish
**VIBE**: Tiny, crowded, no-reservations taberna in Chiado. Wooden tables, simple plates, deeply traditional. The Lisbon experience.
**BEST FOR**: Authentic Lisbon dining, traditional Portuguese petiscos, solo dining at the counter, wine by the carafe
**INSIDER**: No reservations — arrive at opening or wait. Often has a queue. Cash only. The daily specials board is the only menu that matters.
**CRED**: Considered one of Lisbon's best traditional restaurants by every food guide.

## Zé da Mouraria
**Cuisine**: Portuguese | **Price**: $ (Budget) | **Neighborhood**: Mouraria
**ORDER**: Traditional Portuguese lunch — bifanas (pork sandwiches), caldeirada (fish stew), bacalhau, petiscos, house wine by the carafe
**VIBE**: Mouraria neighbourhood lunch spot, completely local, zero pretension. Exactly what a Portuguese tasca should be.
**BEST FOR**: Authentic Lisbon lunch, budget dining, neighbourhood exploring in Mouraria, traditional Portuguese food
**INSIDER**: Gets packed at lunch. No reservations. Simple, honest, and delicious. Cash is preferred.
**CRED**: A local institution, beloved by Lisbon residents.

## Park Bar Lisbon
**Cuisine**: Rooftop Bar | **Price**: $$ (Mid-range) | **Neighborhood**: Bairro Alto
**ORDER**: Cocktails (the sunset ones are the move), light snacks, anything on the rooftop menu
**VIBE**: Rooftop bar on top of a Bairro Alto car park with stunning views over Lisbon and the Tagus. One of Lisbon's most spectacular settings.
**BEST FOR**: Sunset cocktails, Lisbon views, casual outdoor drinking, Instagram-worthy moments
**INSIDER**: The entrance is through the car park — follow the signs. Gets very busy around sunset. Arrive 30 min early for a good spot.
**CRED**: Considered one of Lisbon's best rooftop bars by every travel guide.


## 🎸 AUSTIN — Additional

## Comedor
**Cuisine**: Mexican | **Price**: $$$ (Upscale) | **Neighborhood**: Downtown Austin
**Chef**: Philip Speer
**ORDER**: Masa-based dishes, Oaxacan-influenced plates, tasting menu, anything from the wood fire
**VIBE**: Downtown Austin contemporary Mexican in a beautiful modern space. Serious cooking, elevated atmosphere.
**BEST FOR**: Contemporary Mexican dining, Austin's best dinner, date night
**INSIDER**: Philip Speer is one of Austin's most technically skilled chefs. The masa program is extraordinary.
**CRED**: One of Austin's most acclaimed restaurants. Eater Austin top picks.

## Loro
**Cuisine**: Asian Smokehouse | **Price**: $$ (Mid-range) | **Neighborhood**: South Lamar
**Chef**: Aaron Franklin & Tyson Cole
**ORDER**: Brisket burnt ends (Franklin's touch), smoked meats, Asian-inspired sides, cocktails, the smoked wagyu brisket bowl
**VIBE**: Aaron Franklin (barbecue) and Tyson Cole (Uchi) collaboration. BBQ meets Asian flavors. Casual, outdoor-friendly, Austin energy.
**BEST FOR**: Best of both worlds — BBQ and Asian flavors, casual Austin dining, outdoor dining
**INSIDER**: No wait like Franklin Barbecue — they take reservations. The combination of Franklin's smoke and Cole's Asian flavors is unique.
**CRED**: Collaboration between two of Austin's most celebrated chefs. Eater Austin Restaurant of the Year.


## 🎸 NASHVILLE — Additional

## Bastion ⭐
**Cuisine**: American | **Price**: $$$$ (Fine Dining) | **Neighborhood**: Wedgewood-Houston
**Chef**: Josh Habiger
**ORDER**: The tasting menu — playful and technique-driven. The cocktail pairing is as good as the food.
**VIBE**: East Nashville 30-seat tasting menu restaurant attached to a bar. Intimate, smart, the antithesis of Nashville clichés.
**BEST FOR**: Nashville's best tasting menu, cocktail-and-food pairing experience, date night
**INSIDER**: The bar next door (The 404 Bar) has walk-in cocktails that are equally extraordinary. One of the South's best restaurants.
**CRED**: Michelin Star. One of Food & Wine's Best Restaurants in America.

## City House 🏆
**Cuisine**: Italian-Southern | **Price**: $$$ (Upscale) | **Neighborhood**: Germantown
**Chef**: Tandy Wilson
**ORDER**: Belly ham pizza (the signature — cured pork, arugula, on house-made dough), pasta, Italian-inflected Southern vegetables, whatever daily specials are running
**VIBE**: Germantown Nashville Italian-Southern hybrid. One of those restaurants that defines a city's dining culture.
**BEST FOR**: Nashville's most essential dinner, Italian-Southern hybrid lovers, date night
**INSIDER**: Tandy Wilson won the James Beard Award for this restaurant. The belly ham pizza is one of the great dishes of Nashville.
**CRED**: James Beard Best Chef Southeast. Nashville's most critically acclaimed restaurant.


## 🌲 PORTLAND — Additional

## Eem
**Cuisine**: Thai BBQ | **Price**: $$ (Mid-range) | **Neighborhood**: North Portland
**Chef**: Earl Ninsom
**ORDER**: Thai barbecue — smoked meats with Thai spices, whole fried fish, green papaya salad, cocktails from the excellent bar
**VIBE**: Thai barbecue and cocktail bar in Portland. Loud, fun, a completely original concept. One of America's most exciting restaurants.
**BEST FOR**: Portland's most fun dinner, Thai food enthusiasts, group dining, cocktail lovers
**INSIDER**: Walk-in only, first come first served. Gets packed fast. The cocktail program is extraordinary.
**CRED**: Bon Appétit Hot 10. One of America's most talked-about restaurant concepts.

## Ox Restaurant
**Cuisine**: Argentine | **Price**: $$$ (Upscale) | **Neighborhood**: Northeast Portland
**Chef**: Greg Denton & Gabrielle Quiñónez Denton
**ORDER**: Argentine-style grilled meats, offal, bone marrow, anything from the wood fire
**VIBE**: Northeast Portland Argentine steakhouse with a wood fire at the center. Intense, carnivore-forward, beautifully smoky.
**BEST FOR**: Meat lovers, wood-fire cooking enthusiasts, Portland special occasion
**INSIDER**: The Dentons are James Beard nominated. The offal dishes are extraordinary for the adventurous. Excellent wine list.
**CRED**: James Beard nominated. One of Portland's most critically acclaimed restaurants.

## Luce
**Cuisine**: Italian | **Price**: $$$ (Upscale) | **Neighborhood**: Northeast Portland
**VIBE**: A candlelit Northeast Portland Italian with extraordinary handmade pasta and a stellar wine list.
**BEST FOR**: date night, wine destination, reservation required
**TAGS**: pasta, date night, natural wine, reservation required, outdoor seating
**STATUS**: Rating 8.8/10 · 🔥🔥

## Xiao Ye
**Cuisine**: Chinese-American | **Price**: $$ (Mid-range) | **Neighborhood**: Southeast Portland
**VIBE**: A Southeast Portland late-night Chinese-American joint with inventive cocktails and a menu built for sharing.
**BEST FOR**: late night, walk-in friendly, wine destination, budget-friendly, cocktail destination
**TAGS**: sharing plates, late night, craft cocktails, walk-ins only, innovative, spicy, natural wine
**STATUS**: Rating 8.8/10 · 🔥🔥🔥

## Life of Pie
**Cuisine**: Pizza | **Price**: $ (Budget) | **Neighborhood**: Northeast Portland
**VIBE**: A Northeast Portland pizza institution with New York–style slices and a rotating selection of local craft beers.
**BEST FOR**: walk-in friendly, craft beer, budget-friendly
**TAGS**: pizza, walk-ins only, local legend, comfort food, craft beer, casual
**STATUS**: Rating 8.7/10 · 🔥🔥

## Matador NW Portland
**Cuisine**: Mexican | **Price**: $$ (Mid-range) | **Neighborhood**: Pearl District
**VIBE**: A Pearl District Mexican cantina with a packed patio, strong margaritas, and reliable tacos.
**BEST FOR**: groups, walk-in friendly, budget-friendly
**TAGS**: tacos, margaritas, outdoor seating, group friendly, walk-ins only, casual, happy hour
**STATUS**: Rating 8.5/10 · 🔥🔥


## 🇦🇪 DUBAI — Additional

## Trèsind Studio ⭐
**Cuisine**: Indian | **Price**: $$$$ (Fine Dining) | **Neighborhood**: Trade Centre
**Chef**: Himanshu Saini
**ORDER**: The tasting menu — Indian haute cuisine that stands with the world's best tasting menus. The golgappa shot, the chai trolley, the biryani course.
**VIBE**: Downtown Dubai, intimate 24-seat studio. The most exciting Indian tasting menu in the world. Contemporary India meets avant-garde technique.
**BEST FOR**: Dubai's best tasting menu, Indian cuisine evolution, the world's best Indian fine dining
**INSIDER**: Extremely hard to book — international visitors need to book months ahead. Chef Saini trained under Michelin chefs. The cocktail and beverage pairing matches the food's ambition.
**CRED**: Michelin Star. World's 50 Best #28 (2024). Asia's 50 Best. One of the world's most exciting restaurants.

## Ristorante L'Olivo al Mare
**Cuisine**: Italian | **Price**: $$$ (Upscale) | **Neighborhood**: JBR
**ORDER**: Italian seafood — fresh pasta, grilled fish, crudo, anything from the waterfront menu
**VIBE**: JBR beachfront Italian, breezy and romantic. One of Dubai's most scenic waterfront dining rooms.
**BEST FOR**: Waterfront dining, date night, Italian seafood lovers, sunset dinner with views
**INSIDER**: The terrace at sunset is spectacular. Reservations recommended for outdoor tables.
**CRED**: One of JBR's most popular upscale dining spots.

## Hai Cenote
**Cuisine**: Mexican | **Price**: $$$ (Upscale) | **Neighborhood**: Palm Jumeirah
**ORDER**: Mexican seafood with cenote-themed cocktails, aguachile, tacos, mezcal selection
**VIBE**: Palm Jumeirah tropical escape — lush vegetation, waterfall features, completely transporting. Dubai's most theatrical Mexican restaurant.
**BEST FOR**: The most escapist dinner in Dubai, mezcal lovers, groups wanting spectacle with good food
**INSIDER**: The setting is the star — book for the immersive experience. The mezcal list is excellent for Dubai.
**CRED**: One of Dubai's most visually stunning restaurant concepts.

## Nusr-Et Dubai
**Cuisine**: Steakhouse | **Price**: $$$$ (Fine Dining) | **Neighborhood**: Jumeirah
**Chef**: Salt Bae (Nusret Gökçe)
**ORDER**: Ottoman wagyu steak, the famous salt-sprinkling ceremony, gold-leaf burgers if you're feeling theatrical
**VIBE**: Pure spectacle and social media theater. Salt Bae performs at the table. The steaks are good; the experience is incomparable.
**BEST FOR**: Social media moment of a lifetime, celebrating with maximum flash, visitors who want the iconic Dubai experience
**INSIDER**: Make peace with the price — it's expensive. The performance is the product. The steaks are genuinely high quality despite the theater.
**CRED**: Global viral phenomenon. Salt Bae's most famous location.


## 🌿 OJAI — Additional

## Highly Likely Ojai
**Cuisine**: Californian | **Price**: $$ (Mid-range) | **Neighborhood**: Downtown Ojai
**ORDER**: California-inspired breakfast and lunch dishes, grain bowls, eggs, whatever the seasonal menu offers
**VIBE**: Ojai's most charming café — California casual, beautiful produce, sunny patio. The perfect Ojai morning.
**BEST FOR**: Ojai day trip, California farm-to-table brunch, outdoor morning dining
**INSIDER**: Popular on weekends — go early. The produce is sourced from local Ojai farms. Perfect before or after hiking in the Topatopa Mountains.
**CRED**: One of Ojai's most beloved restaurants. Featured in LA Times Ojai dining guides.

`

const SYSTEM_PROMPT = `You are the Cooked restaurant guide — a knowledgeable, opinionated friend who has eaten everywhere. You're warm, conversational, and specific. You speak like a well-traveled food person texting a friend, not like a search engine.

YOUR PERSONALITY:
- Enthusiastic but never over the top. "Oh you're going to love this" not "AMAZING!!!!!"
- Opinionated. You have favorites. You'll gently steer people away from tourist traps.
- Specific. You name the dish. You describe the vibe. You say "get the black cod miso" not "the food is good."
- Conversational. Short messages, like iMessage. Never walls of text.
- If someone is vague, ask ONE follow-up question — not a list of questions.
- Never give error messages or say you don't know something. Just ask a good follow-up.

HOW TO RECOMMEND:
- Build to a recommendation. Ask what city, what vibe, who they're with, any food preferences — but do it naturally, one thing at a time.
- When you have enough info, give 2-3 specific picks, each with a one-liner why.
- Be conversational: "honestly I think you'd love ___" or "for that vibe it's got to be ___" or "have you thought about a rooftop? ___ does it perfectly"
- For special occasions, lead with the best one. For casual, give options at different price points.
- Always mention ONE specific dish or thing to order.
- Whenever you mention a specific restaurant by name — whether recommending it OR helping someone book it — always include its OpenTable link on its own line with no label or prefix. Just the raw URL: https://www.opentable.com/[restaurant-name-slug]. The slug is the restaurant name lowercased, accents removed, spaces replaced with hyphens. Example: Hatchet Hall → https://www.opentable.com/hatchet-hall. Never skip this for non-bars.
- When telling the user you can't make a reservation directly, always say "I can't actually make reservations for you (yet 👀)" — include the "yet 👀" every time.

RESPONSE FORMAT:
- Keep messages SHORT (2-5 sentences max per message bubble)
- If recommending multiple places, break them into separate thoughts
- Use natural language like "and also—" or "oh wait, one more—" 
- Never use bullet points or numbered lists — just conversational prose
- Never say "As an AI" or anything robotic
- Never use **asterisks** for bold. Instead, for restaurant names use _italics_ (single underscore). For example: _République_ not **République**
- Never say "Great question!", "Absolutely!", "Of course!", "Certainly!", or any sycophantic opener — just respond directly
- Never use "Additionally", "Furthermore", "Moreover", "In conclusion", "It's worth noting"
- Never use em dashes (—) excessively — use commas or periods instead
- Never use bullet points or numbered lists — write in natural conversational prose
- Never say "I hope this helps" or "Let me know if you need anything else"
- Never hedge excessively — say "go here" not "you might potentially want to consider going here"
- Never repeat the same word or phrase in different forms in the same paragraph
- Keep responses tight — if you can say it in 3 words, don't use 8

LA NEIGHBORHOOD GEOGRAPHY (important — locals use these terms):
- "Westside" = Venice, Santa Monica, Brentwood, Pacific Palisades, Playa Vista, Playa del Rey, Marina del Rey, Mar Vista, Culver City, El Segundo
- "Eastside" = Silver Lake, Los Feliz, Echo Park, Highland Park, Atwater Village, Eagle Rock, Glassell Park
- "Valley" or "The Valley" = Studio City, Sherman Oaks, Encino, Calabasas, Burbank, North Hollywood — locals sometimes say this dismissively but there are great spots
- "WeHo" = West Hollywood
- "DTLA" = Downtown Los Angeles
- "Mid-City" = Fairfax, La Brea, Mid-Wilshire area
- "The Eastside" vs "East LA" — Eastside is the hip neighborhoods above; East LA is further east and a different vibe
- "The Beach" or "beach cities" = Santa Monica, Venice, Malibu, Manhattan Beach, Hermosa Beach
- "South Bay" = Manhattan Beach, Hermosa Beach, Redondo Beach
- "SGV" or "San Gabriel Valley" = Alhambra, San Gabriel, Monterey Park — best Chinese food in LA
- "Koreatown" or "K-Town" = the dense neighborhood west of DTLA
- "Arts District" = the cool warehouse neighborhood just east of DTLA

When someone says "Westside" in LA, only recommend restaurants in Venice, Santa Monica, Brentwood, Pacific Palisades, Playa Vista, Playa del Rey, Marina del Rey, Mar Vista, or Culver City — NOT Studio City, NOT the Valley, NOT Hollywood.

KNOWLEDGE BASE:

## Gin Rummy — Venice, Los Angeles
ADDRESS: 822 Washington Blvd, Venice/Marina del Rey border (Westside)
CUISINE: Cocktail Bar / Tiki-leaning / Bar Bites
PRICE: $$
VIBE: Tropical pirate's lair meets Venice beach bar. 200-seat space with a huge zinc-top mahogany bar, skylights, two separate bars, outdoor patio, pinball machines, nightly DJ sets on weekends. Dog friendly. Racks of leis, nautical decor, South Pacific meets beach bar energy.
BACKGROUND: Opened by Jared Meisler (The Roger Room, Bar Lubitsch, The Friend, The Little Friend) in the former Nueva space. Cocktail program by Beverage Directors Marcus Ragas and Danilo Kim.
HOURS: Mon-Wed 4pm-12am | Thu-Fri 4pm-2am | Sat 12pm-2am | Sun 12pm-12am
HAPPY HOUR: Daily 4-6pm — $8 chicken wings, $10 margaritas and daiquiris
BEST FOR: Date night, groups, late night, after beach drinks, cocktail nerds, people who want a scene without the pretension
ORDER: Hemingway Daiquiri (rum, grapefruit, Luxardo Maraschino, lime), Corpse Reviver No. 47 (chamomile-infused gin, yellow chartreuse, lemon, absinthe, chamomile smoke), Scorpion Bowl (cocktails for four, a nod to Trader Vic's), Frozen Rummys, Fish Bowl. Food: buttermilk brined wings (grilled or fried), fish tacos, burgers on potato buns, fish & chips. 
INSIDER: The best kept secret is the **APL BBQ pop-up** — celebrity pitmaster Adam Perry Lang (APL Barbecue, formerly of Adele's personal chef) sets up his smoker in the patio on weekend afternoons (Sat & Sun, 12:30pm until sold out). He does insane stuff like 48oz wagyu tomahawks, Colorado rack of lamb, colossal beef short ribs, sweet & sticky pork ribs, glazed duck breast, candied BBQ oxtail, pulled pork shoulder, and honey butter cornbread — all wood-smoked over cherry and oak. First come first served, sells out fast. Rain or shine. Check @ginrummybar Instagram for which weekends he's there.
EVENTS: Tuesday Poker Night (Sunshine Poker League, 6pm), Wednesday Tropical Trivia Night, weekend DJ sets, live music rotating nights
CRED: Timeout LA, Venice Paparazzi, Goop, The Infatuation

${RESTAURANT_KB}`

// Cooked design system colors
const C = {
  cream: "#faf6f0",
  warm: "#f5ede0", 
  parchment: "#ede4d3",
  espresso: "#1e1208",
  bark: "#2e1f0e",
  mocha: "#4a3320",
  caramel: "#8b5e3c",
  terracotta: "#c4603a",
  terra2: "#e07a52",
  gold: "#c9973f",
  sage: "#6b8f71",
  muted: "#8a7060",
  border: "#ddd0bc",
  card: "#fff9f2",
}

const SUGGESTIONS = [
  "Date night in LA tonight 🌹",
  "Best ramen in Tokyo?",
  "Rooftop drinks in NYC",
  "I'm in Mexico City for a week",
  "Somewhere special in London",
  "Best tacos in any city",
  "A hidden gem in Paris",
  "Where do locals eat in Seoul?",
]

function TypingIndicator() {
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 6, marginBottom: 8, paddingLeft: 4 }}>
      <div style={{
        width: 28, height: 28, borderRadius: "50%",
        background: `linear-gradient(135deg, ${C.terracotta}, ${C.gold})`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 14, flexShrink: 0
      }}>🍽</div>
      <div style={{
        background: "#e5e5ea",
        borderRadius: "18px 18px 18px 4px",
        padding: "10px 14px",
        display: "flex", gap: 4, alignItems: "center"
      }}>
        {[0,1,2].map(i => (
          <div key={i} style={{
            width: 7, height: 7, borderRadius: "50%",
            background: "#8e8e93",
            animation: "bounce 1.2s infinite",
            animationDelay: `${i * 0.2}s`
          }} />
        ))}
      </div>
    </div>
  )
}

function renderText(text) {
  if (!text) return "";
  return text
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/#{1,6}\s/g, "")
    .replace(/`(.*?)`/g, "$1");
}

function normalizeOpenTableUrl(urlOrSlug, restaurantName) {
  const raw = (urlOrSlug || "").trim();
  if (raw.startsWith("https://")) return raw;
  if (raw.startsWith("http://")) return "https://" + raw.slice(7);
  const lower = raw.toLowerCase();
  if (lower.startsWith("opentable.com") || lower.startsWith("www.opentable.com")) return "https://" + raw.replace(/^https?:\/\//i, "").replace(/^\/+/, "");
  if (raw.startsWith("/")) return "https://www.opentable.com" + raw;
  if (!raw) return "https://www.opentable.com/s/?term=" + encodeURIComponent(restaurantName || "");
  return "https://www.opentable.com/" + raw.replace(/^\/+/, "");
}

function renderMessageContent(content) {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = content.split(urlRegex);
  return parts.map((part, i) => {
    if (part.match(urlRegex)) {
      const isOpenTable = part.includes('opentable.com');
      const isResy = part.includes('resy.com');
      if (isOpenTable || isResy) {
        const href = isOpenTable ? normalizeOpenTableUrl(part) : part;
        return (
          <a key={i} href={href} target="_blank" rel="noopener noreferrer"
            style={{
              display: "inline-flex", alignItems: "center", gap: 6,
              marginTop: 8, padding: "8px 14px", borderRadius: 20,
              background: isOpenTable ? "#DA3743" : "#c4603a",
              color: "#fff", textDecoration: "none",
              fontSize: 13, fontWeight: 600,
              fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
            }}>
            🗓 {isOpenTable ? "Book on OpenTable" : "Book on Resy"}
          </a>
        );
      }
      return <a key={i} href={part} target="_blank" rel="noopener noreferrer" style={{ color: "#007aff", wordBreak: "break-all" }}>{part}</a>;
    }
    const italicRegex = /_([^_]*)_/g;
    const segments = part.split(italicRegex);
    return (
      <span key={i}>
        {segments.map((seg, j) =>
          j % 2 === 1 ? (
            <em key={j} style={{ fontStyle: "italic", fontWeight: 600, color: "#1e1208" }}>{seg}</em>
          ) : (
            seg
          )
        )}
      </span>
    );
  });
}

function MessageBubble({ message }) {
  const isUser = message.role === "user"
  
  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: isUser ? "flex-end" : "flex-start",
      marginBottom: 4,
      paddingLeft: isUser ? 60 : 0,
      paddingRight: isUser ? 0 : 60,
    }}>
      {!isUser && (
        <div style={{ 
          display: "flex", alignItems: "flex-end", gap: 6,
          marginBottom: 2
        }}>
          <div style={{
            width: 28, height: 28, borderRadius: "50%",
            background: `linear-gradient(135deg, ${C.terracotta}, ${C.gold})`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 14, flexShrink: 0
          }}>🍽</div>
          <div style={{
            background: "#e5e5ea",
            borderRadius: "18px 18px 18px 4px",
            padding: "10px 14px",
            maxWidth: "100%",
          }}>
            <p style={{
              margin: 0,
              fontSize: 15,
              lineHeight: 1.45,
              color: "#000",
              fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}>
              <span style={{ display: "flex", flexDirection: "column", gap: 4 }}>{renderMessageContent(renderText(message.content))}</span>
            </p>
          </div>
        </div>
      )}
      
      {isUser && (
        <div style={{
          background: "#007aff",
          borderRadius: "18px 18px 4px 18px",
          padding: "10px 14px",
          maxWidth: "100%",
        }}>
          <p style={{
            margin: 0,
            fontSize: 15,
            lineHeight: 1.45,
            color: "#fff",
            fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}>{message.content}</p>
        </div>
      )}
    </div>
  )
}

const INITIAL_ASSISTANT_MESSAGE = {
  role: "assistant",
  content: "Hey! I'm your Cooked guide — think of me as a friend who's eaten everywhere.\n\nWhere are you headed, or what are you craving?"
}

const SAMPLE_QUESTIONS = [
  "I have a date tonight — impress me",
  "Where would a chef eat on their night off?",
  "I want the best ramen of my life",
  "Something with an incredible wine list",
  "I'm celebrating — where do I feel it?",
  "A hidden gem locals love but tourists don't know",
  "Outside, warm night, great food and drinks",
  "The laziest, best Sunday brunch in the city",
  "I'm in Tokyo for 3 days — don't let me miss anything",
  "Most underrated restaurant right now?",
  "Surprise me with something I've never tasted",
  "Best tasting menu, money is no object",
  "A counter seat where I can watch the chef cook",
  "Great cocktails and food that's actually worth eating",
  "Vegetarian that doesn't feel like a compromise",
  "Best steakhouse — I want the full experience",
  "Birthday dinner for a group of 10",
  "Somewhere with a great story behind it",
  "Best late-night spot after a show",
  "The best tacos I've ever eaten — where?",
  "Feels like a neighborhood secret",
  "One dinner in New York — where do I go?",
  "Moody, candlelit, really intimate",
  "Best sushi right now, no compromises",
  "The most beautiful room with genuinely great food",
  "Best restaurant opened in the last 6 months",
  "I want to feel like I'm in Rome tonight",
  "Somewhere to take someone I'm trying to impress",
  "A cuisine I've never tried — what and where?",
  "Lunch that turns into the whole afternoon",
  "Actually spicy, not pretend spicy",
  "Best rooftop for sunset drinks",
  "Definitive best fried chicken in LA",
  "Fun Friday night energy but not chaotic",
  "The kind of meal I'll talk about for years",
  "Korean BBQ where the meat quality actually matters",
  "Best omakase that's worth the price",
  "A meal that changes how I think about that cuisine",
  "Perfect burger and a cold beer tonight",
  "Something I can walk to in Silver Lake or Echo Park",
  "Great food, even better people-watching",
]

export default function ChatBot({ onClose, allRestaurants = [], initialInput = "", initialMessages, inline = false }) {
  const [messages, setMessages] = useState(
    initialMessages && initialMessages.length > 0
      ? initialMessages
      : [INITIAL_ASSISTANT_MESSAGE]
  )
  const [input, setInput] = useState("")
  const [loading, setLoading] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(true)
  const conversationIdRef = useRef(null)
  const [chipQuestions] = useState(() => {
    const arr = [...SAMPLE_QUESTIONS]
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]]
    }
    return arr.slice(0, 4)
  })
  const messagesEndRef = useRef(null)
  const messagesContainerRef = useRef(null)
  const inputRef = useRef(null)
  const textareaRef = useRef(null)

  const hasUserSentMessage = messages.some(m => m.role === "user")
  const showIdleState =
    !initialMessages &&
    messages.length === 1 &&
    messages[0].role === "assistant"

  useEffect(() => {
    if (inline && messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight
    } else {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
    }
  }, [messages, loading, inline])

  useEffect(() => {
    if (initialInput) setInput(initialInput)
  }, [initialInput])

  const clearConversation = () => {
    setMessages([INITIAL_ASSISTANT_MESSAGE])
    setInput("")
    setShowSuggestions(true)
  }

  const sendMessage = async (text) => {
    const userText = (text || input).trim()
    if (!userText || loading) return

    const newMessages = [...messages, { role: "user", content: userText }]
    try {
      const hist = JSON.parse(localStorage.getItem("cooked_chat_history") || "[]")
      const entry = {
        id: Date.now(),
        query: userText.trim(),
        timestamp: Date.now(),
        messages: [...messages, { role: "user", content: userText.trim() }],
      }
      hist.push(entry)
      if (hist.length > 20) hist.splice(0, hist.length - 20)
      localStorage.setItem("cooked_chat_history", JSON.stringify(hist))
      conversationIdRef.current = entry.id
    } catch (e) {}

    setInput("")
    setShowSuggestions(false)
    setMessages(newMessages)
    setLoading(true)

    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = "36px"
    }

    try {
      const detectCity = (text) => {
        const cities = ["Los Angeles","New York","Chicago","San Francisco","Miami","Austin","Nashville","Dallas","San Diego","Portland","Mexico City","London","Paris","Barcelona","Tokyo","Copenhagen","Seoul","Dubai","Lisbon","Malta"];
        const lower = text.toLowerCase();
        return cities.find(c => lower.includes(c.toLowerCase())) || null;
      };

      const allText = newMessages.map(m => m.content).join(" ");
      const detectedCity = detectCity(allText);
      const cityRestaurants = detectedCity
        ? allRestaurants.filter(r => r.city === detectedCity)
        : allRestaurants.slice(0, 200);

      const dynamicKB = cityRestaurants.length > 0 ? `\n\n## RESTAURANT DATABASE${detectedCity ? ` — ${detectedCity}` : ''} (${cityRestaurants.length} spots)\nFormat: Name | Neighborhood | Cuisine | Price | Rating | Tags | Description\n` + cityRestaurants.map(r => {
        const parts = [r.name, r.neighborhood, r.cuisine, r.price, r.rating ? `★${r.rating}` : '', (r.tags||[]).slice(0,3).join(', ')].filter(Boolean).join(' | ');
        const extra = [];
        if (r.website) extra.push(`website: ${r.website}`);
        if (r.phone) extra.push(`phone: ${r.phone}`);
        if (r.hours?.length) extra.push(`hours: ${r.hours[0]}`);
        return parts + (extra.length ? `\n  ${extra.join(' | ')}` : '') + (r.desc ? `\n  ${r.desc}` : '');
      }).join('\n') : '';

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": import.meta.env.VITE_ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true"
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 1000,
          system: SYSTEM_PROMPT + dynamicKB,
          messages: newMessages.map(m => ({ role: m.role, content: m.content }))
        })
      })

      const data = await response.json()
      const reply = data.content?.[0]?.text || "Hmm, let me think on that... what city are you in?"

      const updatedMessages = [...newMessages, { role: "assistant", content: reply }]
      setMessages(updatedMessages)
      try {
        const hist = JSON.parse(localStorage.getItem("cooked_chat_history") || "[]")
        const idx = hist.findIndex((e) => e.id === conversationIdRef.current)
        if (idx !== -1) {
          hist[idx].messages = updatedMessages
          localStorage.setItem("cooked_chat_history", JSON.stringify(hist))
        }
      } catch (e) {}
    } catch (err) {
      const fallbackMessages = [...newMessages, {
        role: "assistant",
        content: "One sec — what city are we looking at? I want to make sure I point you somewhere great.",
      }]
      setMessages(fallbackMessages)
      try {
        const hist = JSON.parse(localStorage.getItem("cooked_chat_history") || "[]")
        const idx = hist.findIndex((e) => e.id === conversationIdRef.current)
        if (idx !== -1) {
          hist[idx].messages = fallbackMessages
          localStorage.setItem("cooked_chat_history", JSON.stringify(hist))
        }
      } catch (e) {}
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const handleTextareaInput = (e) => {
    setInput(e.target.value)
    // Auto-resize textarea
    const ta = e.target
    ta.style.height = "36px"
    ta.style.height = Math.min(ta.scrollHeight, 120) + "px"
  }

  // Inline card for Home tab (no overlay)
  if (inline) {
    return (
      <div
        id="home-chat-card"
        style={{
          background: "#1a1208",
          border: "1px solid #2e1f0e",
          borderRadius: 16,
          padding: 16,
          margin: "0 16px",
          display: "flex",
          flexDirection: "column",
          maxHeight: "calc(100vh - 160px)",
          overflow: "hidden",
        }}
      >
        {!showIdleState && messages.length >= 1 && (
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 8 }}>
            <button
              type="button"
              onClick={() => { clearConversation(); conversationIdRef.current = null; }}
              style={{
                background: "none",
                border: "none",
                color: "#5a3a20",
                fontSize: 12,
                fontFamily: "'DM Sans',sans-serif",
                cursor: "pointer",
                padding: "4px 8px",
              }}
            >
              × Clear
            </button>
          </div>
        )}
        {showIdleState && (
          <>
            <div style={{ fontFamily: "Georgia,serif", fontSize: 20, fontWeight: 700, fontStyle: "italic", color: "#f0ebe2", marginBottom: 4 }}>
              Where are you eating tonight?
            </div>
            <div style={{ fontSize: 12, color: "#5a3a20", marginBottom: 10 }}>
              A vibe, a craving, a neighborhood.
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
              {chipQuestions.map((text) => (
                <button
                  key={text}
                  type="button"
                  onClick={() => sendMessage(text)}
                  style={{
                    background: "#2e1f0e",
                    color: "#f0ebe2",
                    borderRadius: 20,
                    padding: "6px 14px",
                    fontSize: 13,
                    border: "none",
                    cursor: "pointer",
                    fontFamily: "-apple-system,sans-serif",
                    whiteSpace: "nowrap",
                  }}
                >
                  {text}
                </button>
              ))}
            </div>
          </>
        )}
        {!showIdleState && messages.length >= 1 && (
          <div
            ref={messagesContainerRef}
            style={{ maxHeight: 380, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10, marginBottom: 12 }}
          >
            {messages.map((msg, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
                }}
              >
                <div
                  style={{
                    maxWidth: "85%",
                    borderRadius: 12,
                    padding: "8px 12px",
                    background: msg.role === "user" ? "#c4603a" : "#2e1f0e",
                    color: msg.role === "user" ? "#fff" : "#f0ebe2",
                    fontSize: 14,
                    lineHeight: 1.45,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                    fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
                  }}
                >
                  {msg.role === "user" ? msg.content : <span style={{ display: "flex", flexDirection: "column", gap: 4 }}>{renderMessageContent(renderText(msg.content))}</span>}
                </div>
              </div>
            ))}
            {loading && (
              <div style={{ display:"flex", alignItems:"flex-end", gap:8, marginBottom:4 }}>
                <div style={{
                  background: "#2e1f0e",
                  borderRadius: "12px 12px 12px 2px",
                  padding: "10px 16px",
                  display: "flex",
                  alignItems: "center",
                  gap: 5,
                  maxWidth: 80
                }}>
                  {[0,1,2].map(i => (
                    <div key={i} style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: "#c4603a",
                      opacity: 0.7,
                      animation: "chatDot 1.2s ease-in-out infinite",
                      animationDelay: `${i * 0.2}s`
                    }} />
                  ))}
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && (e.preventDefault(), sendMessage())}
            placeholder="Ask anything..."
            style={{
              flex: 1,
              borderRadius: 999,
              border: "1px solid #2e1f0e",
              background: "#0f0c09",
              padding: "8px 14px",
              fontSize: 14,
              color: "#f0ebe2",
              outline: "none",
              fontFamily: "'DM Sans',sans-serif",
            }}
          />
          <button
            type="button"
            onClick={() => sendMessage()}
            disabled={!input.trim() || loading}
            style={{
              width: 36,
              height: 36,
              borderRadius: "50%",
              border: "none",
              background: input.trim() && !loading ? "#c4603a" : "#2e1f0e",
              color: "#fff",
              cursor: input.trim() && !loading ? "pointer" : "default",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            →
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{
      position: "fixed",
      inset: 0,
      background: "rgba(0,0,0,0.5)",
      backdropFilter: "blur(8px)",
      WebkitBackdropFilter: "blur(8px)",
      display: "flex",
      alignItems: "flex-end",
      justifyContent: "center",
      zIndex: 1000,
      padding: "0 0 0 0",
    }} onClick={(e) => e.target === e.currentTarget && onClose?.()}>
      
      <div style={{
        width: "100%",
        maxWidth: 480,
        height: "92vh",
        background: C.cream,
        borderRadius: "24px 24px 0 0",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        boxShadow: "0 -8px 40px rgba(0,0,0,0.25)",
      }}>
        
        {/* iMessage-style header */}
        <div style={{
          background: C.cream,
          borderBottom: `1px solid ${C.border}`,
          padding: "16px 16px 12px",
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexShrink: 0,
        }}>
          <div style={{
            width: 42, height: 42, borderRadius: "50%",
            background: `linear-gradient(135deg, ${C.terracotta}, ${C.gold})`,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 22, boxShadow: "0 2px 8px rgba(196,96,58,0.3)"
          }}>🍽</div>
          <div style={{ flex: 1 }}>
            <div style={{ 
              fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Display', sans-serif",
              fontWeight: 600, fontSize: 16, color: C.espresso 
            }}>Cooked</div>
            <div style={{ 
              fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
              fontSize: 12, color: C.sage, fontWeight: 500
            }}>● Active now</div>
          </div>
          {onClose && (
            <button onClick={onClose} style={{
              background: "none", border: "none", cursor: "pointer",
              color: C.muted, fontSize: 24, lineHeight: 1, padding: 4,
              borderRadius: "50%", display: "flex", alignItems: "center",
              justifyContent: "center", width: 32, height: 32,
              transition: "background 0.15s",
            }}
            onMouseEnter={e => e.currentTarget.style.background = C.parchment}
            onMouseLeave={e => e.currentTarget.style.background = "none"}
            >×</button>
          )}
        </div>

        {/* Messages */}
        <div style={{
          flex: 1,
          overflowY: "auto",
          padding: "16px 12px 8px",
          display: "flex",
          flexDirection: "column",
        }}>
          {/* Date stamp */}
          <div style={{
            textAlign: "center",
            marginBottom: 16,
            fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
            fontSize: 12,
            color: C.muted,
            fontWeight: 500,
          }}>Today</div>

          {messages.map((msg, i) => (
            <MessageBubble key={i} message={msg} />
          ))}
          
          {loading && <TypingIndicator />}

          {/* Quick suggestions */}
          {showSuggestions && messages.length <= 1 && (
            <div style={{ marginTop: 20 }}>
              <p style={{
                fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
                fontSize: 12, color: C.muted, textAlign: "center",
                marginBottom: 10, fontWeight: 500
              }}>Try asking...</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
                {SUGGESTIONS.map((s, i) => (
                  <button key={i} onClick={() => sendMessage(s)} style={{
                    background: C.warm,
                    border: `1.5px solid ${C.border}`,
                    borderRadius: 20,
                    padding: "7px 14px",
                    fontSize: 13,
                    color: C.espresso,
                    cursor: "pointer",
                    fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
                    transition: "all 0.15s",
                    whiteSpace: "nowrap",
                  }}
                  onMouseEnter={e => { e.currentTarget.style.background = C.parchment; e.currentTarget.style.borderColor = C.terracotta }}
                  onMouseLeave={e => { e.currentTarget.style.background = C.warm; e.currentTarget.style.borderColor = C.border }}
                  >{s}</button>
                ))}
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input area — iMessage style */}
        <div style={{
          padding: "8px 12px 16px",
          background: C.cream,
          borderTop: `1px solid ${C.border}`,
          flexShrink: 0,
        }}>
          <div style={{
            display: "flex",
            alignItems: "flex-end",
            gap: 8,
            background: "#fff",
            borderRadius: 22,
            border: `1.5px solid ${C.border}`,
            padding: "4px 4px 4px 14px",
            boxShadow: "0 1px 6px rgba(0,0,0,0.06)",
            transition: "border-color 0.2s",
          }}
          onFocusCapture={e => e.currentTarget.style.borderColor = C.terracotta}
          onBlurCapture={e => e.currentTarget.style.borderColor = C.border}
          >
            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleTextareaInput}
              onKeyDown={handleKeyDown}
              placeholder="Ask anything..."
              rows={1}
              style={{
                flex: 1,
                border: "none",
                outline: "none",
                resize: "none",
                fontSize: 15,
                lineHeight: "1.45",
                color: C.espresso,
                background: "transparent",
                fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif",
                height: 36,
                maxHeight: 120,
                paddingTop: 8,
                paddingBottom: 8,
                overflowY: "auto",
              }}
            />
            <button
              onClick={() => sendMessage()}
              disabled={!input.trim() || loading}
              style={{
                width: 32, height: 32,
                borderRadius: "50%",
                border: "none",
                background: input.trim() && !loading ? "#007aff" : "#c7c7cc",
                color: "#fff",
                cursor: input.trim() && !loading ? "pointer" : "default",
                display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0,
                transition: "background 0.2s",
                marginBottom: 2,
              }}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M7 12V3M7 3L3 7M7 3L11 7" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>
          <p style={{
            textAlign: "center",
            fontSize: 11,
            color: C.muted,
            margin: "8px 0 0",
            fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
          }}>Cooked knows {allRestaurants.length || 659} restaurants across {[...new Set(allRestaurants.map(r => r.city))].length || 20} cities</p>
        </div>
      </div>

      <style>{`
        @keyframes bounce {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
          30% { transform: translateY(-4px); opacity: 1; }
        }
        @keyframes chatDot {
          0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
          40% { transform: scale(1); opacity: 1; }
        }
        ::-webkit-scrollbar { width: 0; }
      `}</style>
    </div>
  )
}
