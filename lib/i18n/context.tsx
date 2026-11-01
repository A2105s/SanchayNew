'use client';

import { createContext, useContext, useEffect, useState, useCallback, useRef, type ReactNode } from 'react';

export type SupportedLanguage = 'en' | 'hi' | 'mr' | 'gu' | 'bn';

export interface LanguageOption {
  code: SupportedLanguage;
  label: string;
  nativeLabel: string;
}

export const LANGUAGES: LanguageOption[] = [
  { code: 'en', label: 'English', nativeLabel: 'English' },
  { code: 'hi', label: 'Hindi', nativeLabel: 'हिन्दी' },
  { code: 'mr', label: 'Marathi', nativeLabel: 'मराठी' },
  { code: 'gu', label: 'Gujarati', nativeLabel: 'ગુજરાતી' },
  { code: 'bn', label: 'Bengali', nativeLabel: 'বাংলা' },
];

const DICTIONARY: Record<SupportedLanguage, Record<string, string>> = {
  en: {},
  hi: {
    'Dashboard': 'डैशबोर्ड',
    'Fleet': 'वाहन बेड़ा',
    'Fleet registry': 'बेड़ा रजिस्ट्री',
    'Discover': 'खोजें',
    'Live map': 'लाइव मैप',
    'Requests': 'अनुरोध',
    'Allocations': 'आवंटन',
    'Operations': 'संचालन',
    'Stations': 'थाने व डिपो',
    'Transfers': 'स्थानांतरण',
    'Compliance': 'अनुपालन',
    'Maintenance': 'रखरखाव',
    'Idle & reuse': 'निष्क्रिय व पुनःउपयोग',
    'Incidents': 'घटनाएं',
    'IoT hub': 'आईओटी हब',
    'Spaces': 'नागरिक स्थान',
    'Space bookings': 'स्थान बुकिंग',
    'Space requests': 'स्थान अनुरोध',
    'Booking policy': 'बुकिंग नीति',
    'Reports': 'रिपोर्ट्स',
    'Audit': 'ऑडिट',
    'Settings': 'सेटिंग्स',
    'My station': 'मेरा थाना',
    'Register vehicle': 'वाहन पंजीकृत करें',
    'Register seized': 'जब्त वाहन पंजीकृत करें',
    'Import CSV': 'सीएसवी आयात करें',
    'Export CSV': 'सीएसवी निर्यात करें',
    'New request': 'नया अनुरोध',
    'Cancel request': 'अनुरोध रद्द करें',
    'Cancel': 'रद्द करें',
    'Approve': 'स्वीकृत करें',
    'Reject': 'अस्वीकार करें',
    'Submit': 'जमा करें',
    'Confirm': 'पुष्टि करें',
    'Save': 'सुरक्षित करें',
    'Retry': 'पुनः प्रयास करें',
    'Close': 'बंद करें',
    'Log out': 'लॉग आउट',
    'Search': 'खोजें',
    'View details': 'विवरण देखें',
    'Manage': 'प्रबंधन',
    'Refresh': 'ताज़ा करें',
    'Active': 'सक्रिय',
    'Idle': 'निष्क्रिय',
    'Moving': 'गतिशील',
    'Breakdown': 'खराब',
    'Offline': 'ऑफलाइन',
    'Available': 'उपलब्ध',
    'Allocated': 'आवंटित',
    'In maintenance': 'रखरखाव में',
    'Out of service': 'सेवा से बाहर',
    'Retired': 'सेवानिवृत्त',
    'Seized / impounded': 'जब्त / सीज',
    'Government fleet': 'सरकारी बेड़ा',
    'Eligible': 'पात्र',
    'Ineligible': 'अपात्र',
    'Restricted': 'प्रतिबंधित',
    'Pending verification': 'सत्यापन लंबित',
    'Draft': 'प्रारूप',
    'Submitted': 'प्रस्तुत',
    'Under review': 'समीक्षाधीन',
    'Changes requested': 'संशोधन आवश्यक',
    'Approved': 'स्वीकृत',
    'Rejected': 'अस्वीकृत',
    'Cancelled': 'रद्द',
    'Expired': 'समाप्त',
    'Reserved': 'आरक्षित',
    'Awaiting handover': 'हैंडओवर की प्रतीक्षा',
    'Completed': 'पूर्ण'
  },
  mr: {
    'Dashboard': 'डॅशबोर्ड',
    'Fleet': 'फ्लीट',
    'Fleet registry': 'फ्लीट नोंदणी',
    'Discover': 'शोधा',
    'Live map': 'थेट नकाशा',
    'Requests': 'विनंत्या',
    'Allocations': 'वाटप',
    'Operations': 'ऑपरेशन्स',
    'Stations': 'स्टेशन्स',
    'Transfers': 'बदल्या',
    'Compliance': 'अनुपालन',
    'Maintenance': 'देखभाल',
    'Idle & reuse': 'निष्क्रिय आणि पुनर्वापर',
    'Incidents': 'घटना',
    'IoT hub': 'IoT हब',
    'Spaces': 'मोकळी जागा',
    'Space bookings': 'जागा बुकिंग',
    'Space requests': 'जागा विनंत्या',
    'Booking policy': 'बुकिंग धोरण',
    'Reports': 'अहवाल',
    'Audit': 'ऑडिट',
    'Settings': 'सेटिंग्ज',
    'My station': 'माझे स्टेशन',
    'Register vehicle': 'वाहन नोंदणी करा',
    'Register seized': 'रजिस्टर जप्त',
    'Import CSV': 'CSV आयात करा',
    'Export CSV': 'CSV निर्यात करा',
    'New request': 'नवीन विनंती',
    'Cancel request': 'विनंती रद्द करा',
    'Cancel': 'रद्द करा',
    'Approve': 'मंजूर करा',
    'Reject': 'नकार द्या',
    'Submit': 'सबमिट करा',
    'Confirm': 'पुष्टी करा',
    'Save': 'जतन करा',
    'Retry': 'पुन्हा प्रयत्न करा',
    'Close': 'बंद करा',
    'Log out': 'लॉग आउट करा',
    'Search': 'शोधा',
    'View details': 'तपशील पहा',
    'Manage': 'व्यवस्थापित करा',
    'Refresh': 'रिफ्रेश करा',
    'Active': 'सक्रिय',
    'Idle': 'निष्क्रिय',
    'Moving': 'हलवत आहे',
    'Breakdown': 'ब्रेकडाउन',
    'Offline': 'ऑफलाइन',
    'Available': 'उपलब्ध',
    'Allocated': 'वाटप केले',
    'In maintenance': 'देखभाल मध्ये',
    'Out of service': 'सेवाबाह्य',
    'Retired': 'निवृत्त',
    'Seized / impounded': 'जप्त / जप्त',
    'Government fleet': 'सरकारी ताफा',
    'Eligible': 'पात्र',
    'Ineligible': 'अपात्र',
    'Restricted': 'प्रतिबंधित',
    'Pending verification': 'पडताळणी प्रलंबित',
    'Draft': 'मसुदा',
    'Submitted': 'सादर केले',
    'Under review': 'पुनरावलोकन अंतर्गत',
    'Changes requested': 'बदलांची विनंती केली',
    'Approved': 'मंजूर',
    'Rejected': 'नाकारले',
    'Cancelled': 'रद्द केले',
    'Expired': 'कालबाह्य',
    'Reserved': 'राखीव',
    'Awaiting handover': 'हस्तांतराच्या प्रतीक्षेत',
    'Completed': 'पूर्ण झाले'
  },
  gu: {
    'Dashboard': 'ડેશબોર્ડ',
    'Fleet': 'કાફલો',
    'Fleet registry': 'ફ્લીટ રજિસ્ટ્રી',
    'Discover': 'શોધો',
    'Live map': 'જીવંત નકશો',
    'Requests': 'વિનંતીઓ',
    'Allocations': 'ફાળવણી',
    'Operations': 'કામગીરી',
    'Stations': 'સ્ટેશનો',
    'Transfers': 'સ્થાનાંતરણ',
    'Compliance': 'અનુપાલન',
    'Maintenance': 'જાળવણી',
    'Idle & reuse': 'નિષ્ક્રિય અને પુનઃઉપયોગ',
    'Incidents': 'ઘટનાઓ',
    'IoT hub': 'IoT હબ',
    'Spaces': 'જગ્યાઓ',
    'Space bookings': 'જગ્યા બુકિંગ',
    'Space requests': 'જગ્યા વિનંતીઓ',
    'Booking policy': 'બુકિંગ નીતિ',
    'Reports': 'અહેવાલો',
    'Audit': 'ઓડિટ',
    'Settings': 'સેટિંગ્સ',
    'My station': 'મારું સ્ટેશન',
    'Register vehicle': 'વાહન રજીસ્ટર કરો',
    'Register seized': 'રજીસ્ટર જપ્ત',
    'Import CSV': 'CSV આયાત કરો',
    'Export CSV': 'CSV નિકાસ કરો',
    'New request': 'નવી વિનંતી',
    'Cancel request': 'વિનંતી રદ કરો',
    'Cancel': 'રદ કરો',
    'Approve': 'મંજૂર',
    'Reject': 'અસ્વીકાર કરો',
    'Submit': 'સબમિટ કરો',
    'Confirm': 'પુષ્ટિ કરો',
    'Save': 'સાચવો',
    'Retry': 'ફરી પ્રયાસ કરો',
    'Close': 'બંધ કરો',
    'Log out': 'લોગ આઉટ કરો',
    'Search': 'શોધો',
    'View details': 'વિગતો જુઓ',
    'Manage': 'મેનેજ કરો',
    'Refresh': 'તાજું કરો',
    'Active': 'સક્રિય',
    'Idle': 'નિષ્ક્રિય',
    'Moving': 'ખસેડવું',
    'Breakdown': 'ભંગાણ',
    'Offline': 'ઑફલાઇન',
    'Available': 'ઉપલબ્ધ છે',
    'Allocated': 'ફાળવેલ',
    'In maintenance': 'જાળવણીમાં',
    'Out of service': 'સેવા બહાર',
    'Retired': 'નિવૃત્ત',
    'Seized / impounded': 'જપ્ત / જપ્ત',
    'Government fleet': 'સરકારી કાફલો',
    'Eligible': 'પાત્ર',
    'Ineligible': 'અયોગ્ય',
    'Restricted': 'પ્રતિબંધિત',
    'Pending verification': 'ચકાસણી બાકી છે',
    'Draft': 'ડ્રાફ્ટ',
    'Submitted': 'સબમિટ કર્યું',
    'Under review': 'સમીક્ષા હેઠળ',
    'Changes requested': 'ફેરફારોની વિનંતી કરી',
    'Approved': 'મંજૂર',
    'Rejected': 'ફગાવી દીધી',
    'Cancelled': 'રદ કરેલ',
    'Expired': 'સમાપ્ત',
    'Reserved': 'આરક્ષિત',
    'Awaiting handover': 'હેન્ડઓવરની રાહ જોઈ રહ્યું છે',
    'Completed': 'પૂર્ણ થયું'
  },
  bn: {
    'Dashboard': 'ড্যাশবোর্ড',
    'Fleet': 'নৌবহর',
    'Fleet registry': 'ফ্লিট রেজিস্ট্রি',
    'Discover': 'আবিষ্কার করুন',
    'Live map': 'লাইভ মানচিত্র',
    'Requests': 'অনুরোধ',
    'Allocations': 'বরাদ্দ',
    'Operations': 'অপারেশন',
    'Stations': 'স্টেশন',
    'Transfers': 'স্থানান্তর',
    'Compliance': 'সম্মতি',
    'Maintenance': 'রক্ষণাবেক্ষণ',
    'Idle & reuse': 'নিষ্ক্রিয় এবং পুনরায় ব্যবহার',
    'Incidents': 'ঘটনা',
    'IoT hub': 'আইওটি হাব',
    'Spaces': 'স্পেস',
    'Space bookings': 'স্পেস বুকিং',
    'Space requests': 'স্থান অনুরোধ',
    'Booking policy': 'বুকিং নীতি',
    'Reports': 'রিপোর্ট',
    'Audit': 'নিরীক্ষা',
    'Settings': 'সেটিংস',
    'My station': 'আমার স্টেশন',
    'Register vehicle': 'গাড়ি নিবন্ধন করুন',
    'Register seized': 'রেজিস্টার জব্দ',
    'Import CSV': 'CSV আমদানি করুন',
    'Export CSV': 'CSV রপ্তানি করুন',
    'New request': 'নতুন অনুরোধ',
    'Cancel request': 'অনুরোধ বাতিল করুন',
    'Cancel': 'বাতিল করুন',
    'Approve': 'অনুমোদন করুন',
    'Reject': 'প্রত্যাখ্যান করুন',
    'Submit': 'জমা দিন',
    'Confirm': 'নিশ্চিত করুন',
    'Save': 'সংরক্ষণ করুন',
    'Retry': 'আবার চেষ্টা করুন',
    'Close': 'বন্ধ',
    'Log out': 'লগ আউট করুন',
    'Search': 'অনুসন্ধান করুন',
    'View details': 'বিস্তারিত দেখুন',
    'Manage': 'পরিচালনা করুন',
    'Refresh': 'রিফ্রেশ',
    'Active': 'সক্রিয়',
    'Idle': 'নিষ্ক্রিয়',
    'Moving': 'চলন্ত',
    'Breakdown': 'ভাঙ্গন',
    'Offline': 'অফলাইন',
    'Available': 'পাওয়া যায়',
    'Allocated': 'বরাদ্দ',
    'In maintenance': 'রক্ষণাবেক্ষণে',
    'Out of service': 'সেবার বাইরে',
    'Retired': 'অবসরপ্রাপ্ত',
    'Seized / impounded': 'জব্দ/জব্দ',
    'Government fleet': 'সরকারি নৌবহর',
    'Eligible': 'যোগ্য',
    'Ineligible': 'অযোগ্য',
    'Restricted': 'সীমাবদ্ধ',
    'Pending verification': 'মুলতুবি যাচাই',
    'Draft': 'খসড়া',
    'Submitted': 'জমা দেওয়া হয়েছে',
    'Under review': 'পর্যালোচনা অধীনে',
    'Changes requested': 'পরিবর্তন অনুরোধ করা হয়েছে',
    'Approved': 'অনুমোদিত',
    'Rejected': 'প্রত্যাখ্যাত',
    'Cancelled': 'বাতিল',
    'Expired': 'মেয়াদ শেষ',
    'Reserved': 'সংরক্ষিত',
    'Awaiting handover': 'হস্তান্তরের অপেক্ষায়',
    'Completed': 'সম্পন্ন'
  }
};

interface I18nContextValue {
  language: SupportedLanguage;
  setLanguage: (lang: SupportedLanguage) => void;
  t: (text: string, fallback?: string) => string;
  translateDynamic: (text: string) => Promise<string>;
}

const I18nContext = createContext<I18nContextValue>({
  language: 'en',
  setLanguage: () => {},
  t: (text, fallback) => fallback ?? text,
  translateDynamic: async (text) => text,
});

const memoryCache = new Map<string, string>();
const activeRequests = new Map<string, Promise<string>>();

function getLocalStorageKey(lang: string, text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (hash << 5) - hash + text.charCodeAt(i);
    hash |= 0;
  }
  return `sanchay_t_${lang}_${hash}`;
}

async function fetchTranslationFromGoogle(lang: SupportedLanguage, text: string): Promise<string> {
  const cacheKey = `${lang}:${text}`;
  if (memoryCache.has(cacheKey)) {
    return memoryCache.get(cacheKey)!;
  }

  if (typeof window !== 'undefined') {
    try {
      const stored = localStorage.getItem(getLocalStorageKey(lang, text));
      if (stored) {
        memoryCache.set(cacheKey, stored);
        return stored;
      }
    } catch {
      /* ignore */
    }
  }

  if (activeRequests.has(cacheKey)) {
    return activeRequests.get(cacheKey)!;
  }

  const promise = (async () => {
    try {
      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=${lang}&dt=t&q=${encodeURIComponent(text)}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const translated = data?.[0]?.map((x: any) => x[0]).join('') as string;
      const clean = translated ? translated.trim() : text;
      memoryCache.set(cacheKey, clean);
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem(getLocalStorageKey(lang, text), clean);
        } catch {
          /* ignore quota */
        }
      }
      return clean;
    } catch {
      return text;
    } finally {
      activeRequests.delete(cacheKey);
    }
  })();

  activeRequests.set(cacheKey, promise);
  return promise;
}

/**
 * DOM Auto-Translator:
 * Seamlessly translates all visible text nodes and placeholder attributes in the application.
 * Fast instant local dictionary + on-the-fly Google Translate GTX endpoint + memory/localStorage caching.
 */
function useDomAutoTranslator(language: SupportedLanguage) {
  const currentLangRef = useRef(language);
  currentLangRef.current = language;

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const IGNORED_TAGS = new Set([
      'SCRIPT',
      'STYLE',
      'CODE',
      'PRE',
      'SVG',
      'CANVAS',
      'NOSCRIPT'
    ]);

    function shouldSkipElement(el: Element | null): boolean {
      if (!el) return false;
      if (IGNORED_TAGS.has(el.tagName)) return true;
      if (
        el.hasAttribute('data-no-translate') ||
        el.classList.contains('mono') ||
        el.classList.contains('lang-selector-btn') ||
        el.closest('.lang-selector-btn') ||
        el.closest('.station-picker') ||
        el.closest('[data-no-translate="true"]')
      ) {
        return true;
      }
      return shouldSkipElement(el.parentElement);
    }

    function processTextNode(node: Node) {
      const parent = node.parentElement;
      if (!parent || shouldSkipElement(parent)) return;

      const raw = node.nodeValue ?? '';
      const trimmed = raw.trim();
      if (!trimmed || trimmed.length <= 1) return;
      if (/^[\d\s.,:;/#\-+*%=()°N°E₹$€!@?]+$/.test(trimmed)) return;

      if (language === 'en') {
        if ((node as any).__sanchayTranslated) {
          const orig = (node as any).__sanchayOrig;
          if (orig && node.nodeValue !== orig) {
            node.nodeValue = orig;
          }
          delete (node as any).__sanchayTranslated;
        }
        (node as any).__sanchayOrig = raw;
        return;
      }

      if (!(node as any).__sanchayTranslated) {
        (node as any).__sanchayOrig = raw;
      }
      const orig = ((node as any).__sanchayOrig as string) || raw;
      const origTrimmed = orig.trim();

      // 1. Static dictionary
      const dict = DICTIONARY[language];
      if (dict && dict[origTrimmed]) {
        const replacement = orig.replace(origTrimmed, dict[origTrimmed]);
        if (node.nodeValue !== replacement) {
          node.nodeValue = replacement;
          (node as any).__sanchayTranslated = true;
        }
        return;
      }

      // 2. Dynamic fetch
      void fetchTranslationFromGoogle(language, origTrimmed).then((trans) => {
        if (currentLangRef.current !== language) return;
        if (node.isConnected && trans) {
          const replacement = orig.replace(origTrimmed, trans);
          if (node.nodeValue !== replacement) {
            node.nodeValue = replacement;
            (node as any).__sanchayTranslated = true;
          }
        }
      });
    }

    function processPlaceholder(el: HTMLInputElement | HTMLTextAreaElement) {
      if (shouldSkipElement(el)) return;
      const raw = el.placeholder;
      if (!raw || !raw.trim()) return;

      if (language === 'en') {
        if ((el as any).__sanchayTranslatedPlaceholder) {
          const orig = (el as any).__sanchayOrigPlaceholder;
          if (orig && el.placeholder !== orig) el.placeholder = orig;
          delete (el as any).__sanchayTranslatedPlaceholder;
        }
        (el as any).__sanchayOrigPlaceholder = raw;
        return;
      }

      if (!(el as any).__sanchayTranslatedPlaceholder) {
        (el as any).__sanchayOrigPlaceholder = raw;
      }
      const orig = ((el as any).__sanchayOrigPlaceholder as string) || raw;
      const origTrimmed = orig.trim();

      const dict = DICTIONARY[language];
      if (dict && dict[origTrimmed]) {
        el.placeholder = orig.replace(origTrimmed, dict[origTrimmed]);
        (el as any).__sanchayTranslatedPlaceholder = true;
        return;
      }

      void fetchTranslationFromGoogle(language, origTrimmed).then((trans) => {
        if (currentLangRef.current !== language) return;
        if (el.isConnected && trans) {
          el.placeholder = orig.replace(origTrimmed, trans);
          (el as any).__sanchayTranslatedPlaceholder = true;
        }
      });
    }

    function translateAll() {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      const textNodes: Node[] = [];
      let current: Node | null;
      while ((current = walker.nextNode())) {
        textNodes.push(current);
      }
      for (const node of textNodes) {
        processTextNode(node);
      }

      const inputs = document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
        'input[placeholder], textarea[placeholder]'
      );
      inputs.forEach(processPlaceholder);
    }

    translateAll();

    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    const observer = new MutationObserver(() => {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        translateAll();
      }, 100);
    });

    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [language]);
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<SupportedLanguage>('en');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('sanchay_lang') as SupportedLanguage | null;
      if (stored && ['en', 'hi', 'mr', 'gu', 'bn'].includes(stored)) {
        setLanguageState(stored);
      }
    }
  }, []);

  const setLanguage = useCallback((lang: SupportedLanguage) => {
    setLanguageState(lang);
    if (typeof window !== 'undefined') {
      localStorage.setItem('sanchay_lang', lang);
      document.cookie = `sanchay_lang=${lang}; path=/; max-age=31536000; SameSite=Lax`;
    }
  }, []);

  const t = useCallback(
    (text: string, fallback?: string): string => {
      if (language === 'en') return fallback ?? text;
      const dict = DICTIONARY[language];
      if (dict && dict[text]) {
        return dict[text];
      }
      const cacheKey = `${language}:${text}`;
      if (memoryCache.has(cacheKey)) return memoryCache.get(cacheKey)!;
      return fallback ?? text;
    },
    [language]
  );

  const translateDynamic = useCallback(
    async (text: string): Promise<string> => {
      if (!text || language === 'en') return text;
      const dict = DICTIONARY[language];
      if (dict && dict[text]) return dict[text];
      return fetchTranslationFromGoogle(language, text);
    },
    [language]
  );

  useDomAutoTranslator(language);

  return (
    <I18nContext.Provider value={{ language, setLanguage, t, translateDynamic }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useTranslation() {
  return useContext(I18nContext);
}
