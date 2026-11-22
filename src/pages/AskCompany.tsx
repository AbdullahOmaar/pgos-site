import { Link } from 'react-router-dom'
import { Card, Chip, PageTitle } from '../components/ui'

/* صفحة حالة صادقة: طبقة NotebookLM لم تُنشأ بعد — لا توجد بيانات تُجلب هنا
   ولا أي رابط خارجي، لأن أي رابط قبل الإنشاء الفعلي يكون اختراعًا. */
export default function AskCompany() {
  return (
    <div>
      <PageTitle
        title="اسأل الشركة — NotebookLM"
        sub="طبقة أسئلة موثقة بالمصادر فوق مستندات المقر — دورها الاستفهام البشري فقط، وليست سجلًا ولا سلطة ولا أتمتة."
      />

      <Card className="mb-4">
        <div className="flex flex-wrap items-center gap-2">
          <Chip tone="warn">الحالة: لم يُنشأ النوت بوك بعد</Chip>
          <Chip tone="muted">خطوة متصفح معلّقة — بند التتبع في Linear</Chip>
        </div>
        <p className="mt-3 text-sm leading-relaxed">
          حزمة الإعداد <strong>جاهزة وموثقة</strong> في وثيقة تصميم «توتو» (§٥): النوت
          بوك «مرجع الشركة — اسأل توتو» على حساب المالك (Google AI Pro)، ومصادره هي
          مستندات المقر نفسها (سجل قرارات الشركة · بروتوكول المقر المشترك · سجل الشركة
          الموحّد · مرجع الشركة)، مع أسئلة بداية مقترحة. لكن <strong>إنشاء النوت بوك
          نفسه خطوة متصفح</strong> من واجهة NotebookLM بحساب المالك، وهي معلّقة ضمن
          البنود المتبقية في بند التتبع في Linear — <strong>فلا يوجد رابط هنا</strong>، وأي رابط
          يُعرض قبل الإنشاء الفعلي يكون اختراعًا.
        </p>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <h2 className="mb-2 font-bold">ما الذي ستفعله الطبقة عند إنشائها؟</h2>
          <ul className="list-disc space-y-1.5 ps-5 text-sm leading-relaxed">
            <li>
              أسئلة بالعربية عن قرارات الشركة وحالة المشاريع وحدود التفويض، بإجابات{' '}
              <strong>موثقة باقتباسات من المصادر نفسها</strong> — خاصية NotebookLM
              الأساسية.
            </li>
            <li>صفر تكلفة إضافية — داخل اشتراك Google AI Pro القائم عند المالك.</li>
            <li>تعمل من تطبيق NotebookLM على الموبايل للسؤال السريع.</li>
            <li>حداثة إجاباتها بحداثة آخر مزامنة يدوية للمصادر من الواجهة.</li>
          </ul>
        </Card>
        <Card>
          <h2 className="mb-2 font-bold">ما الذي لن تفعله أبدًا؟</h2>
          <ul className="list-disc space-y-1.5 ps-5 text-sm leading-relaxed">
            <li>
              <strong>ليست نظام سجل:</strong> لا تكتب قيودًا ولا تعدّل أي مصدر كانوني.
            </li>
            <li>
              <strong>ليست سلطة:</strong> إجاباتها استفهام من مستندات منشورة، لا قرارات
              ولا اعتمادات.
            </li>
            <li>
              <strong>ليست أتمتة:</strong> لا API استعلام للمستهلك — الأسئلة يطرحها البشر
              من الواجهة، وتحديث المصادر إجراء واجهة يدوي.
            </li>
            <li>
              سجل الشركة وحارس الاكتمال يظلان آليتَي النظام — الطبقة واجهة قراءة فوق
              مستنداتهما المنشورة في المقر.
            </li>
          </ul>
        </Card>
      </div>

      <Card className="mt-4">
        <h2 className="mb-2 font-bold">في انتظار الإنشاء — البدائل الحالية داخل الموقع</h2>
        <p className="text-sm leading-relaxed">
          نفس المستندات المصدر متاحة هنا بصيغ منظمة:{' '}
          <Link to="/hq-decisions" className="font-semibold text-accent underline">
            قرارات المقر
          </Link>{' '}
          ·{' '}
          <Link to="/ledger" className="font-semibold text-accent underline">
            سجل الشركة
          </Link>{' '}
          ·{' '}
          <Link to="/authority" className="font-semibold text-accent underline">
            السلطة والأدوار وحدود التفويض
          </Link>
          .
        </p>
      </Card>
    </div>
  )
}
