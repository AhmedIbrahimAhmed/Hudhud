import { useState } from 'react';
import api from '../api/client.js';
import jsPDF from 'jspdf';
import { shapeArabic, registerArabicFont, wrapArabic } from '../utils/arabicPdf.js';

// Editorial policies extracted from the codebase
const EDITORIAL_POLICIES = [
  {
    title: 'معايير تحسين محركات البحث (SEO)',
    category: 'SEO',
    lastUpdated: '2024',
    sections: [
      {
        title: 'طول المقال',
        description: 'المقالات الأطول عادةً أفضل لمحركات البحث.',
        rules: [
          'الحد الأدنى: 300 كلمة',
          'يُنصح بالمقالات الأطول لتحسين الترتيب',
        ],
      },
      {
        title: 'طول العنوان',
        description: 'العنوان يجب أن يكون ضمن النطاق المثالي لنتائج البحث.',
        rules: [
          'الحد الأدنى: 20 حرف',
          'الحد الأقصى: 60 حرف',
          'العناوين الأطول قد تُقتطع في نتائج البحث',
        ],
      },
      {
        title: 'كثافة الكلمات المفتاحية',
        description: 'تجنب الحشو المفرط للكلمات المفتاحية.',
        rules: [
          'الحد الأقصى للكلمة المفتاحية الرئيسية: 4%',
          'حاول التنويع في استخدام الكلمات',
          'أدرج الكلمة المفتاحية في العنوان إن أمكن',
        ],
      },
      {
        title: 'وصف الميتا',
        description: 'اقتراح وصف ميتا من أول 155 حرف من نص المقال.',
        rules: [
          'الطول المثالي: 155 حرف',
          'يجب أن يكون وصفاً جذاباً ودقيقاً',
          'يشمل الكلمات المفتاحية الرئيسية',
        ],
      },
      {
        title: 'قابلية القراءة',
        description: 'جُمل أقصر تحسّن القراءة وتجربة المستخدم.',
        rules: [
          'متوسط طول الجملة المثالي: أقل من 25 كلمة',
          'استخدم جُمل قصيرة ومباشرة',
          'تجنب الجُمل الطويلة المعقدة',
        ],
      },
    ],
  },
  {
    title: 'معايير المحتوى والاعتدال',
    category: 'المحتوى',
    lastUpdated: '2024',
    sections: [
      {
        title: 'فحص المحتوى الصادم',
        description: 'يتم فحص المحتوى للتأكد من خلوّه من المحتوى الصادم.',
        rules: [
          'يتم تحديد نسبة المحتوى الصادم',
          'يتم تقديم أسباب التحذير عند وجود محتوى صادم',
          'يتم اقتراح تعديلات للمحتوى الصادم',
        ],
      },
      {
        title: 'فحص المحتوى المخل',
        description: 'يتم فحص المحتوى للتأكد من ملاءمته للنشر.',
        rules: [
          'يتم تحديد نسبة المحتوى المخل',
          'يتم تقديم أسباب التحذير عند وجود محتوى مقل',
          'يتم اقتراح تعديلات للمحتوى المخل',
        ],
      },
      {
        title: 'التدقيق اللغوي',
        description: 'يتم التدقيق اللغوي باستخدام الذكاء الاصطناعي.',
        rules: [
          'تصحيح الأخطاء الإملائية',
          'تصحيح الأخطاء النحوية',
          'اقتراح تحسينات أسلوبية',
        ],
      },
      {
        title: 'نسبة الأخطاء',
        description: 'يتم حساب نسبة الأخطاء في المقال.',
        rules: [
          'تُحسب النسبة بالنسبة لإجمالي الكلمات',
          'الهدف: تقليل نسبة الأخطاء',
          'تُعرض النسبة للمحرر للمتابعة',
        ],
      },
    ],
  },
  {
    title: 'المصطلحات السياسية الفلسطينية',
    category: 'المصطلحات',
    lastUpdated: '2024',
    description: 'دليل المصطلحات السياسية الفلسطينية الموصى بها في الكتابة الصحفية.',
    sections: [
      {
        title: 'مبادئ عامة',
        description: 'استخدام المصطلحات الدقيقة التي تعكس الواقع القانوني والسياسي.',
        rules: [
          'إبراز صفة الاحتلال وفق القانون الدولي',
          'تجنب المصطلحات المحايدة التي تخدم رواية الاحتلال',
          'استخدام المصطلحات التي تثبت الحقوق الفلسطينية',
          'وضع الألقاب الإسرائيلية بين هلالين عند عدم إضفاء الشرعية',
        ],
      },
    ],
  },
];

// Misused terminology extracted from backend/services/terminology/terms.json
const MISUSED_TERMINOLOGY = [
  {
    wrong: 'الأراضي الفلسطينية',
    correct: 'الأرض الفلسطينية المحتلة',
    explanation: 'المصطلح الأدق هو «الأرض الفلسطينية المحتلة» لأنه يثبّت صفة الاحتلال وفق القانون الدولي.',
    category: 'مصطلح سياسي',
  },
  {
    wrong: 'الأراضي المتنازع عليها',
    correct: 'الأرض المحتلة',
    explanation: '«متنازع عليها» تعبير يخدم رواية الاحتلال؛ الصحيح «الأرض المحتلة».',
    category: 'مصطلح سياسي',
  },
  {
    wrong: 'إقامة الدولة الفلسطينية',
    correct: 'تجسيد الدولة / إنهاء الاحتلال',
    explanation: '«إقامة» توحي بعدم وجود الدولة؛ يُفضّل «تجسيد الدولة» أو «إنهاء الاحتلال».',
    category: 'مصطلح سياسي',
  },
  {
    wrong: 'السلطة الفلسطينية',
    correct: 'دولة فلسطين / الحكومة الفلسطينية',
    explanation: 'يُفضّل استخدام «دولة فلسطين» أو «الحكومة الفلسطينية».',
    category: 'مصطلح سياسي',
  },
  {
    wrong: 'الضفة الغربية وقطاع غزة',
    correct: 'قطاع غزة، والضفة الغربية بما فيها القدس الشرقية',
    explanation: 'يجب تضمين القدس الشرقية صراحةً ضمن الأرض المحتلة.',
    category: 'مصطلح سياسي',
  },
  {
    wrong: 'الحرب بين إسرائيل وحماس',
    correct: 'حرب الإبادة الجماعية على قطاع غزة',
    explanation: 'التوصيف الأدق وفق السياق هو «حرب الإبادة الجماعية على قطاع غزة».',
    category: 'مصطلح سياسي',
  },
  {
    wrong: 'حرب غزة',
    correct: 'حرب الإبادة الجماعية على قطاع غزة',
    explanation: '«حرب غزة» تعبير محايد يخفي طبيعة العدوان؛ الأدق «حرب الإبادة الجماعية على قطاع غزة».',
    category: 'مصطلح سياسي',
  },
  {
    wrong: 'جيش الدفاع الإسرائيلي',
    correct: 'جيش الاحتلال الإسرائيلي',
    explanation: '«جيش الدفاع» مصطلح دعائي؛ الصحيح «جيش الاحتلال الإسرائيلي».',
    category: 'مصطلح سياسي',
  },
  {
    wrong: 'الجيش الإسرائيلي',
    correct: 'جيش الاحتلال الإسرائيلي',
    explanation: 'يُفضّل «جيش الاحتلال الإسرائيلي» لإبراز صفة الاحتلال.',
    category: 'مصطلح سياسي',
  },
  {
    wrong: 'شعب غزة',
    correct: 'الشعب الفلسطيني في قطاع غزة',
    explanation: '«شعب غزة» يجزّئ الهوية؛ الأدق «الشعب الفلسطيني في قطاع غزة».',
    category: 'مصطلح سياسي',
  },
  {
    wrong: 'الجدار العازل',
    correct: 'جدار الضم والتوسع / جدار الفصل العنصري',
    explanation: '«العازل» توصيف محايد؛ الأدق «جدار الضم والتوسع» أو «جدار الفصل العنصري».',
    category: 'مصطلح سياسي',
  },
  {
    wrong: 'الجدار الفاصل',
    correct: 'جدار الضم والتوسع / جدار الفصل العنصري',
    explanation: '«الفاصل» توصيف محايد؛ الأدق «جدار الضم والتوسع» أو «جدار الفصل العنصري».',
    category: 'مصطلح سياسي',
  },
  {
    wrong: 'منسق أعمال الحكومة الإسرائيلية',
    correct: 'ما يسمى «المنسق» لقوات الاحتلال',
    explanation: 'يوضع اللقب بين هلالين مع نسبه لقوات الاحتلال.',
    category: 'مصطلح سياسي',
  },
  {
    wrong: 'الحكومة الإسرائيلية',
    correct: 'إسرائيل، القوة القائمة بالاحتلال',
    explanation: 'يُفضّل وصفها بـ«القوة القائمة بالاحتلال» وفق القانون الدولي.',
    category: 'مصطلح سياسي',
  },
  {
    wrong: 'محكمة العدل العليا الإسرائيلية',
    correct: 'ما تسمى «محكمة العدل العليا» التابعة للاحتلال',
    explanation: 'يوضع الاسم بين هلالين مع نسبه للاحتلال.',
    category: 'مصطلح سياسي',
  },
  {
    wrong: 'اليوم التالي للحرب',
    correct: 'ما بعد حرب الإبادة الجماعية',
    explanation: 'يُفضّل «ما بعد حرب الإبادة الجماعية» للحفاظ على دقّة التوصيف.',
    category: 'مصطلح سياسي',
  },
  {
    wrong: 'المستوطنات',
    correct: 'المستوطنات الاستعمارية غير القانونية',
    explanation: 'يُضاف وصف «الاستعمارية غير القانونية» وفق القانون الدولي.',
    category: 'مصطلح سياسي',
  },
  {
    wrong: 'الأسرى',
    correct: 'المعتقلون',
    explanation: 'حسب السياق يُفضّل «المعتقلون» أو «المخطوفون».',
    category: 'مصطلح سياسي',
  },
  {
    wrong: 'وزير الدفاع الإسرائيلي',
    correct: 'ما يسمى «وزير الدفاع الإسرائيلي»',
    explanation: 'يوضع اللقب بين هلالين لعدم إضفاء الشرعية.',
    category: 'مصطلح سياسي',
  },
];

// Arabic stop words from seoService.js
const STOP_WORDS = [
  'في', 'من', 'على', 'الى', 'إلى', 'عن', 'مع', 'هذا', 'هذه', 'ذلك', 'تلك', 'التي', 'الذي', 'و', 'او', 'أو', 'ثم', 'قد', 'كان', 'كانت',
  'ان', 'أن', 'إن', 'ما', 'لا', 'لم', 'لن', 'هو', 'هي', 'هم', 'هن', 'نحن', 'انت', 'أنت', 'بعد', 'قبل', 'بين', 'كل', 'بعض', 'حيث', 'عند',
  'حتى', 'اذا', 'إذا', 'كما', 'لكن', 'او', 'منذ', 'نحو', 'دون', 'غير',
];

export default function Policies() {
  const [activeTab, setActiveTab] = useState('policies');
  const [expandedSection, setExpandedSection] = useState(null);
  const [exporting, setExporting] = useState(false);

  const toggleSection = (index) => {
    setExpandedSection(expandedSection === index ? null : index);
  };

  // Build the PDF entirely with jsPDF using an embedded Arabic TTF font (Amiri).
  // jsPDF v3 handles Arabic shaping + bidi internally at draw time, so the
  // arabicPdf util only embeds a glyph-complete font and swaps unsupported
  // characters (arrows) for a covered fallback. Text is drawn right-aligned at
  // the right margin so Arabic, embedded Latin/numbers, % and parentheses all
  // render correctly in a right-to-left layout.
  const exportToPDF = async () => {
    setExporting(true);
    try {
      const doc = new jsPDF('p', 'mm', 'a4');
      registerArabicFont(doc);

      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      const margin = 16;
      const rightX = pageWidth - margin; // baseline x for right-aligned text
      const contentWidth = pageWidth - margin * 2;
      const bottom = pageHeight - margin;

      const COLOR_TEXT = [17, 24, 39];
      const COLOR_BRAND = [10, 125, 79];
      const COLOR_MUTED = [107, 114, 128];
      const COLOR_FAINT = [156, 163, 175];
      const COLOR_GRAY = [75, 85, 99];
      const COLOR_RED = [220, 38, 38];

      let y = margin;

      const ensureSpace = (needed) => {
        if (y + needed > bottom) {
          doc.addPage();
          y = margin;
        }
      };

      // Draw a logical-order Arabic string (wrapping to content width), at the
      // given font size/weight/color. `x` defaults to the right margin and the
      // text is right-aligned. Advances `y`.
      const drawText = (text, options = {}) => {
        const {
          size = 12,
          weight = 'normal',
          color = COLOR_TEXT,
          lineHeight = 1.6,
          gapAfter = 1.5,
          maxWidth = contentWidth,
          x = rightX,
        } = options;

        doc.setFont('Amiri', weight);
        doc.setFontSize(size);
        doc.setTextColor(color[0], color[1], color[2]);

        const lineStep = (size * 0.3528) * lineHeight; // pt -> mm
        const lines = wrapArabic(doc, text, maxWidth);

        // A heading like "1.1 العنوان": pin the leading section number to the
        // right edge and draw the title to its left. This places the number on
        // the right deterministically, without relying on the PDF viewer's bidi
        // (which inconsistently puts a leading number on the wrong side).
        const headingNum =
          lines.length === 1 ? /^(\d[\d.]*\.?)\s+(\S[\s\S]*)$/.exec(lines[0]) : null;

        lines.forEach((line) => {
          ensureSpace(lineStep);
          y += lineStep;
          if (headingNum) {
            const num = shapeArabic(headingNum[1]);
            doc.text(num, x, y, { align: 'right' });
            doc.text(shapeArabic(headingNum[2]), x - doc.getTextWidth(num + '  '), y, {
              align: 'right',
            });
          } else {
            doc.text(shapeArabic(line), x, y, { align: 'right' });
          }
        });
        y += gapAfter;
      };

      const sectionHeading = (text) => {
        ensureSpace(14);
        y += 4;
        drawText(text, { size: 18, weight: 'bold', color: COLOR_BRAND, gapAfter: 1 });
        // underline under the heading band
        doc.setDrawColor(COLOR_BRAND[0], COLOR_BRAND[1], COLOR_BRAND[2]);
        doc.setLineWidth(0.6);
        doc.line(margin, y, pageWidth - margin, y);
        y += 4;
      };

      // Title + export date
      drawText('السياسات التحريرية والإرشادات', {
        size: 24,
        weight: 'bold',
        color: COLOR_BRAND,
        gapAfter: 2,
      });
      drawText(`تاريخ التصدير: ${new Date().toLocaleDateString('en-GB')}`, {
        size: 11,
        color: COLOR_MUTED,
        gapAfter: 6,
      });

      // 1. Editorial policies
      sectionHeading('1. السياسات التحريرية');
      EDITORIAL_POLICIES.forEach((policy, policyIndex) => {
        drawText(`${policyIndex + 1}.1 ${policy.title}`, {
          size: 15,
          weight: 'bold',
          color: COLOR_BRAND,
          gapAfter: 1,
        });
        drawText(`الفئة: ${policy.category} | آخر تحديث: ${policy.lastUpdated}`, {
          size: 10,
          color: COLOR_FAINT,
          gapAfter: 1.5,
        });
        if (policy.description) {
          drawText(policy.description, { size: 11, color: COLOR_GRAY, gapAfter: 2 });
        }
        policy.sections.forEach((section, sectionIndex) => {
          drawText(`${policyIndex + 1}.1.${sectionIndex + 1} ${section.title}`, {
            size: 12,
            weight: 'bold',
            color: COLOR_GRAY,
            gapAfter: 1,
          });
          if (section.description) {
            drawText(section.description, { size: 11, color: COLOR_MUTED, gapAfter: 1 });
          }
          section.rules.forEach((rule) => {
            drawText(`• ${rule}`, {
              size: 11,
              color: COLOR_GRAY,
              maxWidth: contentWidth - 4,
              gapAfter: 0.5,
            });
          });
          y += 2;
        });
        y += 3;
      });

      // 2. Replaced terminology
      sectionHeading('2. المصطلحات المُستبدلة');
      MISUSED_TERMINOLOGY.forEach((term) => {
        drawText(`${term.wrong}  ←  ${term.correct}`, {
          size: 12,
          weight: 'bold',
          color: COLOR_RED,
          gapAfter: 1,
        });
        drawText(term.explanation, { size: 11, color: COLOR_MUTED, gapAfter: 1 });
        drawText(`الفئة: ${term.category}`, {
          size: 10,
          color: COLOR_FAINT,
          gapAfter: 3,
        });
      });

      // 3. Arabic stop words
      sectionHeading('3. كلمات التوقف العربية');
      drawText(`إجمالي: ${STOP_WORDS.length} كلمة توقف`, {
        size: 11,
        color: COLOR_GRAY,
        gapAfter: 2,
      });
      drawText(STOP_WORDS.join('، '), { size: 12, color: COLOR_GRAY, gapAfter: 2 });

      doc.save('السياسات_التحريرية.pdf');
    } catch (error) {
      console.error('Error exporting PDF:', error);
      alert('حدث خطأ أثناء تصدير الملف');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="max-w-full mx-auto py-6 px-4 space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-gray-800">السياسات التحريرية والإرشادات</h2>
        <button
          onClick={exportToPDF}
          disabled={exporting}
          className="text-sm bg-brand text-white px-4 py-2 rounded-lg hover:bg-brand-dark disabled:opacity-50 flex items-center gap-2"
        >
          {exporting ? (
            <>
              <span className="inline-block w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              جارٍ التصدير...
            </>
          ) : (
            <>
              📥 تصدير PDF
            </>
          )}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-200">
        <button
          onClick={() => setActiveTab('policies')}
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'policies'
              ? 'text-brand border-b-2 border-brand'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          السياسات التحريرية
        </button>
        <button
          onClick={() => setActiveTab('terminology')}
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'terminology'
              ? 'text-brand border-b-2 border-brand'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          المصطلحات المُستبدلة
        </button>
        <button
          onClick={() => setActiveTab('stopwords')}
          className={`px-4 py-2 text-sm font-medium transition-colors ${
            activeTab === 'stopwords'
              ? 'text-brand border-b-2 border-brand'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          كلمات التوقف
        </button>
      </div>

      {/* Policies Tab */}
      {activeTab === 'policies' && (
        <div className="space-y-4">
          {EDITORIAL_POLICIES.map((policy, policyIndex) => (
            <div key={policyIndex} className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-brand">{policy.title}</h3>
                  <p className="text-xs text-gray-400 mt-1">آخر تحديث: {policy.lastUpdated}</p>
                </div>
                <span className="text-xs bg-brand-light text-brand-dark px-2 py-1 rounded-lg">
                  {policy.category}
                </span>
              </div>
              <div className="p-5 space-y-4">
                {policy.description && (
                  <p className="text-sm text-gray-600 bg-gray-50 rounded-xl p-3">
                    {policy.description}
                  </p>
                )}
                {policy.sections.map((section, sectionIndex) => (
                  <div key={sectionIndex} className="border border-gray-200 rounded-xl overflow-hidden">
                    <button
                      onClick={() => toggleSection(`${policyIndex}-${sectionIndex}`)}
                      className="w-full px-4 py-3 flex items-center justify-between bg-gray-50 hover:bg-gray-100 transition-colors"
                    >
                      <span className="text-sm font-bold text-gray-700">{section.title}</span>
                      <span className="text-gray-400">
                        {expandedSection === `${policyIndex}-${sectionIndex}` ? '▼' : '▶'}
                      </span>
                    </button>
                    {expandedSection === `${policyIndex}-${sectionIndex}` && (
                      <div className="p-4 space-y-3">
                        {section.description && (
                          <p className="text-xs text-gray-500">{section.description}</p>
                        )}
                        <ul className="space-y-2">
                          {section.rules.map((rule, ruleIndex) => (
                            <li key={ruleIndex} className="flex items-start gap-2 text-xs text-gray-600">
                              <span className="text-brand mt-0.5">•</span>
                              <span>{rule}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Terminology Tab */}
      {activeTab === 'terminology' && (
        <div className="bg-white border border-gray-200 rounded-2xl p-5">
          <div className="mb-4">
            <h3 className="text-base font-bold text-brand">المصطلحات المُستبدلة</h3>
            <p className="text-xs text-gray-500 mt-1">
              قائمة المصطلحات التي يتم تصحيحها تلقائياً أثناء كتابة المقال
            </p>
          </div>
          <div className="space-y-3">
            {MISUSED_TERMINOLOGY.map((term, index) => (
              <div key={index} className="border border-gray-200 rounded-xl p-4 hover:border-brand transition-colors">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-red-100 text-flag-red grid place-items-center text-sm shrink-0">
                    ✗
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium text-gray-700 line-through">
                        {term.wrong}
                      </span>
                      <span className="text-gray-400">→</span>
                      <span className="text-sm font-bold text-brand">
                        {term.correct}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500">{term.explanation}</p>
                    <span className="inline-block mt-2 text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                      {term.category}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stop Words Tab */}
      {activeTab === 'stopwords' && (
        <div className="bg-white border border-gray-200 rounded-2xl p-5">
          <div className="mb-4">
            <h3 className="text-base font-bold text-brand">كلمات التوقف العربية</h3>
            <p className="text-xs text-gray-500 mt-1">
              كلمات يتم استبعادها من تحليل الكلمات المفتاحية في SEO
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {STOP_WORDS.map((word, index) => (
              <span
                key={index}
                className="text-xs bg-gray-100 text-gray-600 px-3 py-1.5 rounded-lg"
              >
                {word}
              </span>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-4">
            إجمالي: {STOP_WORDS.length} كلمة توقف
          </p>
        </div>
      )}
    </div>
  );
}
