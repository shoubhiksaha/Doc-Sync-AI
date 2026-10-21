import type { ComingSoonProfile } from './types';

/**
 * Planned profiles shown as "Coming Soon" on the home page (with Hindi copy for the UI).
 * Moving one to active = adding a profile file.
 */
export const comingSoonProfiles: ComingSoonProfile[] = [
  {
    title: 'Fleet Fuel & Petty Cash', description: 'Parse logistics fuel slips, toll receipts, and driver petty cash notes.',
    hi: { title: 'फ़्लीट ईंधन और छोटा खर्च', description: 'ईंधन पर्चियाँ, टोल रसीदें और ड्राइवर के छोटे खर्च के नोट पढ़ें।' },
  },
  {
    title: 'Construction Material Inward', description: 'Digitize sand/cement inward challans for site inventory reconciliation.',
    hi: { title: 'निर्माण सामग्री आवक', description: 'साइट के स्टॉक मिलान के लिए रेत/सीमेंट के आवक चालान डिजिटल करें।' },
  },
  {
    title: 'Kirana Store Khatas', description: 'Convert handwritten credit ledgers into structured customer balance sheets.',
    hi: { title: 'किराना दुकान खाते', description: 'हाथ से लिखे उधार खातों को ग्राहक बकाया सूची में बदलें।' },
  },
  {
    title: 'Mandi Auction Slips', description: 'Extract crop type, farmer name, weight, and bid price from APMC mandi slips.',
    hi: { title: 'मंडी नीलामी पर्चियाँ', description: 'APMC मंडी पर्चियों से फ़सल, किसान का नाम, वज़न और बोली भाव निकालें।' },
  },
  {
    title: 'Transport Lorry Receipts (LR)', description: 'Digitize consignor, consignee, e-way bill number, and freight amounts.',
    hi: { title: 'ट्रांसपोर्ट लॉरी रसीदें (LR)', description: 'भेजने वाला, पाने वाला, ई-वे बिल नंबर और भाड़ा राशि डिजिटल करें।' },
  },
  {
    title: 'Dairy Collection Slips', description: 'Parse milk weight, fat percentage, SNF, and rate per liter from local dairy chits.',
    hi: { title: 'डेयरी संग्रह पर्चियाँ', description: 'स्थानीय डेयरी पर्चियों से दूध का वज़न, फ़ैट, SNF और प्रति लीटर दर पढ़ें।' },
  },
  {
    title: 'Handloom Weaver Logs', description: 'Digitize yarn consumed, meters woven, and piece-rate wage calculations.',
    hi: { title: 'हथकरघा बुनकर रजिस्टर', description: 'लगा धागा, बुने गए मीटर और नग-दर मज़दूरी का हिसाब डिजिटल करें।' },
  },
  {
    title: 'Brick Kiln Token Slips', description: 'Count bricks molded, baked, and dispatched using daily worker tokens.',
    hi: { title: 'ईंट भट्ठा टोकन पर्चियाँ', description: 'रोज़ के मज़दूर टोकन से बनी, पकी और भेजी गई ईंटें गिनें।' },
  },
  {
    title: 'Medical Store Prescriptions', description: 'Convert handwritten doctor notes to structured medicine order lists.',
    hi: { title: 'मेडिकल स्टोर पर्चे', description: 'डॉक्टर के हाथ से लिखे पर्चों को दवा ऑर्डर सूची में बदलें।' },
  },
  {
    title: 'Jewelry Making (K कारीगरी) Logs', description: 'Track raw gold issued, wastage, and finished ornament weight.',
    hi: { title: 'गहना कारीगरी रजिस्टर', description: 'दिया गया सोना, घटत और तैयार गहनों का वज़न दर्ज करें।' },
  },
  {
    title: 'Tailoring Measurement Books', description: 'Digitize customer measurements and fabric details for boutique management.',
    hi: { title: 'दर्ज़ी नाप पुस्तिका', description: 'बुटीक के लिए ग्राहकों के नाप और कपड़े का विवरण डिजिटल करें।' },
  },
  {
    title: 'Caterer Raw Material Bills', description: 'Parse sabzi mandi and wholesale grocery handwritten invoices.',
    hi: { title: 'कैटरर कच्चा माल बिल', description: 'सब्ज़ी मंडी और थोक किराना के हाथ से लिखे बिल पढ़ें।' },
  },
  {
    title: 'Daily Wage Muster Rolls', description: 'Extract worker attendance, half-days, and daily payouts from register photos.',
    hi: { title: 'दैनिक मज़दूरी हाज़िरी रजिस्टर', description: 'रजिस्टर की फ़ोटो से हाज़िरी, आधे दिन और रोज़ का भुगतान निकालें।' },
  },
  {
    title: 'Scrap Dealer (Kabadiwala) Rates', description: 'Parse daily rate cards and collection weight receipts by material type.',
    hi: { title: 'कबाड़ीवाला भाव', description: 'सामान के हिसाब से रोज़ के भाव कार्ड और तौल रसीदें पढ़ें।' },
  },
  {
    title: 'Garage Repair Estimates', description: 'Digitize handwritten mechanic quotes for spare parts and labor.',
    hi: { title: 'गैराज मरम्मत अनुमान', description: 'मिस्त्री के हाथ से लिखे पुर्ज़ों और मज़दूरी के अनुमान डिजिटल करें।' },
  },
  {
    title: 'Agriculture Pesticide Bills', description: 'Track fertilizers, seed varieties, and agrochemical purchases for farm accounting.',
    hi: { title: 'कृषि दवा बिल', description: 'खेती के हिसाब के लिए खाद, बीज और कीटनाशक की ख़रीद दर्ज करें।' },
  },
  {
    title: 'Fish Market Auction Chits', description: 'Parse boat name, catch type, weight, and wholesale bid amounts.',
    hi: { title: 'मछली बाज़ार नीलामी पर्चियाँ', description: 'नाव का नाम, मछली का प्रकार, वज़न और थोक बोली पढ़ें।' },
  },
  {
    title: 'Event Decorator Challans', description: 'Track chairs, tents, and lighting equipment rented out and returned.',
    hi: { title: 'डेकोरेटर चालान', description: 'किराए पर दी और लौटाई गई कुर्सियाँ, टेंट और लाइटें दर्ज करें।' },
  },
  {
    title: 'Cable TV / WiFi Collection Receipts', description: 'Digitize monthly subscription payments collected door-to-door.',
    hi: { title: 'केबल टीवी / वाई-फ़ाई वसूली रसीदें', description: 'घर-घर जाकर लिए गए मासिक भुगतान डिजिटल करें।' },
  },
  {
    title: 'Ration Shop (PDS) Distribution Logs', description: 'Parse family ration card numbers and grain quantities disbursed.',
    hi: { title: 'राशन दुकान (PDS) वितरण रजिस्टर', description: 'परिवार के राशन कार्ड नंबर और बाँटे गए अनाज की मात्रा पढ़ें।' },
  },
  {
    title: 'Handicraft Artisan Piece-rate Cards', description: 'Digitize items produced, quality checks, and payment due.',
    hi: { title: 'हस्तशिल्प कारीगर नग-दर कार्ड', description: 'बने सामान, गुणवत्ता जाँच और बकाया भुगतान डिजिटल करें।' },
  },
  {
    title: 'Local Courier Delivery Run-sheets', description: 'Extract tracking numbers, receiver signatures, and COD collected.',
    hi: { title: 'लोकल कूरियर डिलीवरी शीट', description: 'ट्रैकिंग नंबर, पाने वाले के हस्ताक्षर और COD राशि निकालें।' },
  },
  {
    title: 'Godown Storage Receipts', description: 'Parse farmer name, commodity, bag count, and storage duration.',
    hi: { title: 'गोदाम भंडारण रसीदें', description: 'किसान का नाम, जिंस, बोरियों की गिनती और भंडारण अवधि पढ़ें।' },
  },
  {
    title: 'Timber Mart Measurement Slips', description: 'Digitize wood type, logs count, length, girth, and cubic feet volume.',
    hi: { title: 'लकड़ी टाल नाप पर्चियाँ', description: 'लकड़ी का प्रकार, लट्ठों की गिनती, लंबाई, गोलाई और घन फ़ुट डिजिटल करें।' },
  },
  {
    title: 'Mobile Repair Job Cards', description: 'Extract customer issue, IMEI, spare part used, and total repair cost.',
    hi: { title: 'मोबाइल मरम्मत जॉब कार्ड', description: 'ग्राहक की समस्या, IMEI, लगा पुर्ज़ा और कुल मरम्मत ख़र्च निकालें।' },
  },
  {
    title: 'Street Vendor Daily Finance', description: 'Digitize micro-loan collections (daily bishi/chit fund payments).',
    hi: { title: 'रेहड़ी-पटरी दैनिक वित्त', description: 'रोज़ की माइक्रो-लोन वसूली (बिशी/चिट फ़ंड) डिजिटल करें।' },
  },
];
