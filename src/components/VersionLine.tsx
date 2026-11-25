/*
 * سطر الإصدار ووقت النشر — قاعدة مالك ملزمة (2026-11-25): رقم الإصدار ووقت النشر
 * يظهران بشكل أساسي وواضح داخل التطبيق وفي صفحة السبلاش، بصيغة
 * «الإصدار X — نُشر [التاريخ والوقت]»، مبنيين من بيانات البناء نفسه
 * (حقن Vite وقت البناء: __APP_VERSION__ من package.json و__BUILD_TIME__ لحظة
 * البناء) — لا يُكتب أيٌّ منهما يدويًا في الواجهة أبدًا.
 * ترقيم الإصدارات (سجل المراحل): ما قبل 1.0 لحد اكتمال فيز 1، وكل نشر +0.1.
 */
export function versionLabel(): string {
  const version = __APP_VERSION__.replace(/\.0$/, '')
  const when = new Intl.DateTimeFormat('ar-EG', {
    timeZone: 'Africa/Cairo',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(__BUILD_TIME__))
  return `الإصدار ${version} — نُشر ${when}`
}

export default function VersionLine({ className = '' }: { className?: string }) {
  return <p className={className}>{versionLabel()}</p>
}
