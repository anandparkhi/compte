/**
 * Plain-language labels for owner-facing sales and GST screens.
 * Add another locale here to extend the copy; the app's language picker is in i18n/messages.ts.
 */
const english = {
 homeTitle:"Your business at a glance",
 latestImport:"Showing your most recent month with recorded activity. Choose another month below.",
 create:"Create an invoice", createHint:"Speak or type a sale",
 import:"Import GST history", importHint:"Bring your past business records",
 chooseMonth:"Choose a month", insights:"All-time insights", imported:"Imported",
 taxable:"Taxable sales recorded", invoiceValue:"Invoice value", invoiceAmountNote:"Amounts shown on recorded invoices",
 count:"Invoices in this month", buyers:"Customers with invoices", buyersNote:"Unique buyers across recorded invoices",
 sourceTitle:"Where did these figures come from?", sourceHint:"A breakdown of records for this month",
 history:"Imported historical B2B", newlyIssued:"Issued in Compte", readOnly:"read-only", newlyIssuedShort:"new invoices",
 noData:"No sales records for this month yet", noDataHint:"An empty Compte month does not mean your business had no sales. Import a return or create an invoice.",
 seeInvoices:"See invoices", viewHistory:"View invoices for this month",
 returnInfo:"GST filing information", viewReturns:"View returns", returnImported:"GSTR-1 data imported",
 returnUnverified:"GST return status not verified",
 returnNote:"Import is recorded, but government portal filing has not been verified. Do not file a nil return where sales are recorded.",
 returnEmpty:"Compte cannot determine official filing status without confirmation from the GST portal.",
 customers:"Customers in this month", manageCustomers:"Customers",
 noCustomers:"Customer activity appears here when records are available.",
 businessInsights:"Business insights", allInvoices:"All invoices", manage:"Manage customers",
 drafts:"Invoice drafts", draftsHint:"Finish or discard these before issuing",
 taxableNote:"Imported B2B data may omit sales and amendments. Review overlaps with Compte invoices. Invoice value is not cash received or profit.",
 taxNew:"GST calculated on Compte-issued invoices", taxNewNote:"Excludes imported GST; not total tax payable.",
 importedActivity:"historical", newActivity:"new", noHistoricalBuyers:"No historical buyers this month",
 period:"Period", verify:"Filing not verified"
};
const hindi:typeof english = {
 homeTitle:"आपके कारोबार का संक्षिप्त हाल",
 latestImport:"पिछले दर्ज कारोबार वाला महीना दिखाया गया है। नीचे दूसरा महीना चुनें।",
 create:"नया बिल बनाएं", createHint:"बोलकर या लिखकर बिक्री दर्ज करें",
 import:"पुराना GST डेटा लाएं", importHint:"पिछले कारोबार के रिकॉर्ड जोड़ें",
 chooseMonth:"महीना चुनें", insights:"पूरे समय का विश्लेषण", imported:"आयात किया गया",
 taxable:"दर्ज कर योग्य बिक्री", invoiceValue:"बिलों की राशि", invoiceAmountNote:"दर्ज बिलों में दिखाई गई राशि",
 count:"इस महीने के बिल", buyers:"दर्ज बिलों के ग्राहक", buyersNote:"बिलों में अलग-अलग ग्राहक",
 sourceTitle:"ये आंकड़े कहाँ से आए?", sourceHint:"इस महीने के रिकॉर्ड का विवरण",
 history:"पुराने आयातित B2B बिल", newlyIssued:"Compte में जारी बिल", readOnly:"केवल देखने के लिए", newlyIssuedShort:"नए बिल",
 noData:"इस महीने बिक्री का रिकॉर्ड नहीं है", noDataHint:"रिकॉर्ड न होना बिक्री न होने का प्रमाण नहीं है। GST रिटर्न आयात करें या बिल बनाएं।",
 seeInvoices:"बिल देखें", viewHistory:"इस महीने के बिल देखें",
 returnInfo:"GST रिटर्न की जानकारी", viewReturns:"रिटर्न देखें", returnImported:"GSTR-1 डेटा आयात किया गया",
 returnUnverified:"GST रिटर्न की स्थिति सत्यापित नहीं", returnNote:"डेटा आयात हो गया है, लेकिन सरकारी पोर्टल पर फाइलिंग सत्यापित नहीं। बिक्री वाले महीने के लिए nil रिटर्न न भरें।",
 returnEmpty:"GST पोर्टल से पुष्टि के बिना Compte आधिकारिक फाइलिंग स्थिति नहीं बता सकता।",
 customers:"इस महीने के ग्राहक", manageCustomers:"ग्राहक",
 noCustomers:"रिकॉर्ड उपलब्ध होने पर ग्राहक जानकारी यहाँ दिखेगी।",
 businessInsights:"कारोबार का विश्लेषण", allInvoices:"सभी बिल", manage:"ग्राहक संभालें",
 drafts:"अधूरे बिल", draftsHint:"जारी करने से पहले पूरे करें या हटाएं",
 taxableNote:"आयातित B2B रिकॉर्ड में कुछ बिक्री या संशोधन छूट सकते हैं। पुराने और नए रिकॉर्ड मिलान करें। बिल की राशि प्राप्त भुगतान या लाभ नहीं है।",
 taxNew:"Compte में जारी बिलों पर GST", taxNewNote:"इसमें आयातित GST शामिल नहीं; यह कुल देय कर नहीं है।",
 importedActivity:"पुराने", newActivity:"नए", noHistoricalBuyers:"इस महीने पुराने ग्राहक नहीं मिले",
 period:"अवधि", verify:"फाइलिंग सत्यापित नहीं"
};
const marathi:typeof english = {
 homeTitle:"तुमच्या व्यवसायाचा थोडक्यात आढावा",
 latestImport:"शेवटच्या नोंदवलेल्या व्यवसायाचा महिना दाखवला आहे. खाली दुसरा महिना निवडा.",
 create:"नवीन बिल बनवा", createHint:"बोलून किंवा लिहून विक्री नोंदवा",
 import:"जुना GST डेटा आणा", importHint:"मागील व्यवसायाच्या नोंदी जोडा",
 chooseMonth:"महिना निवडा", insights:"संपूर्ण व्यवसायाचा आढावा", imported:"आयात केलेले",
 taxable:"नोंदवलेली करपात्र विक्री", invoiceValue:"बिलांची रक्कम", invoiceAmountNote:"नोंदवलेल्या बिलांतील रक्कम",
 count:"या महिन्यातील बिले", buyers:"नोंदवलेल्या बिलांतील ग्राहक", buyersNote:"बिलांतील वेगवेगळे ग्राहक",
 sourceTitle:"हे आकडे कुठून आले?", sourceHint:"या महिन्यातील नोंदींचे विवरण",
 history:"आयात केलेली जुनी B2B बिले", newlyIssued:"Compte मध्ये जारी बिले", readOnly:"फक्त पाहण्यासाठी", newlyIssuedShort:"नवी बिले",
 noData:"या महिन्यासाठी विक्रीच्या नोंदी नाहीत", noDataHint:"नोंदी नाहीत म्हणजे विक्री झाली नाही असे नाही. GST रिटर्न आयात करा किंवा बिल बनवा.",
 seeInvoices:"बिले पाहा", viewHistory:"या महिन्यातील बिले पाहा",
 returnInfo:"GST रिटर्न माहिती", viewReturns:"रिटर्न पाहा", returnImported:"GSTR-1 डेटा आयात केला",
 returnUnverified:"GST रिटर्न स्थिती पडताळलेली नाही", returnNote:"डेटा आयात केला आहे; सरकारी पोर्टलवरील फाइलिंग पडताळलेले नाही. विक्री असलेल्या महिन्यासाठी nil रिटर्न भरू नका.",
 returnEmpty:"GST पोर्टलवरील पुष्टीशिवाय Compte अधिकृत फाइलिंग स्थिती सांगू शकत नाही.",
 customers:"या महिन्यातील ग्राहक", manageCustomers:"ग्राहक",
 noCustomers:"नोंदी उपलब्ध झाल्यावर ग्राहक माहिती येथे दिसेल.",
 businessInsights:"व्यवसाय विश्लेषण", allInvoices:"सर्व बिले", manage:"ग्राहक व्यवस्थापन",
 drafts:"अपूर्ण बिले", draftsHint:"जारी करण्यापूर्वी पूर्ण करा किंवा काढून टाका",
 taxableNote:"आयात केलेल्या B2B नोंदींमध्ये काही विक्री किंवा दुरुस्त्या नसू शकतात. जुन्या व नव्या नोंदी तपासा. बिलाची रक्कम म्हणजे मिळालेले पैसे किंवा नफा नाही.",
 taxNew:"Compte मध्ये जारी बिलांवरील GST", taxNewNote:"आयातित GST यात नाही; हा एकूण देय कर नाही.",
 importedActivity:"जुनी", newActivity:"नवी", noHistoricalBuyers:"या महिन्यात जुने ग्राहक नाहीत",
 period:"कालावधी", verify:"फाइलिंग पडताळलेली नाही"
};
export const ownerLanguages = { en: english, hi: hindi, mr: marathi };
export function ownerCopy(language:string){return ownerLanguages[language==="hi"?"hi":language==="mr"?"mr":"en"];}
