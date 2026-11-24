import { Card, Chip, EmptyState, ErrorState, LoadingState } from '../components/ui'
import { FreshnessBadge, SectionTitle, StatCard } from '../components/v2/widgets'
import { useOsData } from '../lib/live/provider'

/* الصفحة السادسة (3A-352) — التنظيم والإشعارات ضد جداول M2 (مهاجرة 000004):
   pgos_org_departments / pgos_org_employees / pgos_notification_types / pgos_notification_prefs.
   تنبيه معماري (من المهاجرة نفسها): ده تنظيم الشركة الحقيقي — مش طاقم المكتب الافتراضي، وممنوع خلطهم.
   البيانات دي حية بس: في وضع اللقطة بتظهر حالة «غير متاحة» صريحة بدل أي بديل مخترع. */
export default function OrgV2() {
  const state = useOsData()
  if (state.phase === 'loading') return <LoadingState />
  if (state.phase === 'error') return <ErrorState message={state.message} />
  const d = state.data
  const hasOrg = d.orgDepartments.length > 0 || d.orgEmployees.length > 0 || d.notificationTypes.length > 0

  return (
    <div dir="rtl">
      <header className="mb-4">
        <h1 className="text-[22px] leading-8 font-bold sm:text-2xl">التنظيم والإشعارات</h1>
        <p className="mt-1 text-sm text-muted">أقسام الشركة ووكلاؤها الحقيقيون، وأنواع إشعارات اوس وحالتها (سجل 3A-426).</p>
        <div className="mt-3"><FreshnessBadge source={d.source} generatedAt={d.generatedAt} /></div>
      </header>

      {!hasOrg ? (
        <EmptyState text="بيانات التنظيم والإشعارات موجودة في جداول M2 الحية بس (مش في لقطة الخزنة) — هتظهر هنا أول ما يتفعّل المصدر الحي (خطوة P3 عند مسؤول اوس). لا تُعرض بيانات بديلة، وبذرة المكتب الافتراضي طاقم مختلف وممنوع خلطها بتنظيم الشركة." />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <StatCard label="أقسام" value={d.orgDepartments.length} />
            <StatCard label="وكلاء/موظفون" value={d.orgEmployees.length} />
            <StatCard label="أنواع إشعارات فعّالة" value={d.notificationTypes.filter((t) => t.active).length} sub={`من ${d.notificationTypes.length} أنواع مسجلة`} />
            <StatCard label="تفضيلات أجهزة محفوظة" value={d.notificationPrefsCount} sub={d.notificationPrefsCount === 0 ? 'لسه مفيش جهاز سجّل تفضيلات' : undefined} />
          </div>

          <SectionTitle>الأقسام والفريق</SectionTitle>
          <div className="space-y-3">
            {d.orgDepartments.map((dept) => {
              const members = d.orgEmployees.filter((e) => e.dept_name === dept.name)
              return (
                <Card key={dept.id}>
                  <p className="flex items-center gap-2 font-bold">
                    <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: dept.color ?? 'var(--primary)' }} aria-hidden />
                    {dept.name}
                    <span className="text-xs font-normal text-muted">{members.length} عضو</span>
                  </p>
                  {dept.description ? <p className="mt-1 text-sm text-muted">{dept.description}</p> : null}
                  {dept.projects.length > 0 ? (
                    <p className="mt-2 flex flex-wrap gap-1.5">{dept.projects.map((p) => (<Chip key={p} tone="muted">{p}</Chip>))}</p>
                  ) : null}
                  {members.length > 0 ? (
                    <ul className="mt-3 divide-y divide-border">
                      {members.map((e) => (
                        <li key={e.id} className="flex items-center gap-3 py-2.5">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white" style={{ background: e.color ?? 'var(--primary)' }} aria-hidden>
                            {e.initial ?? e.name.slice(0, 1)}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold">{e.name}</p>
                            <p className="truncate text-xs text-muted">{[e.role, e.group_name, e.project_ref].filter(Boolean).join(' · ') || '—'}</p>
                          </div>
                          {e.status ? <Chip tone="muted">{e.status}</Chip> : null}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </Card>
              )
            })}
          </div>

          {d.orgEmployees.some((e) => !e.dept_name) ? (
            <p className="mt-3 text-xs text-muted">فيه أعضاء بلا قسم مسجل في المصدر — بيظهروا في عدّاد الفريق بس لحد ما يتسجل قسمهم.</p>
          ) : null}

          <SectionTitle>أنواع الإشعارات</SectionTitle>
          <div className="space-y-3">
            {d.notificationTypes.map((t) => (
              <Card key={t.id}>
                <p className="flex flex-wrap items-center gap-2 font-bold">
                  {t.label}
                  {t.active ? <Chip tone="ok">فعّال</Chip> : <Chip tone="muted">غير فعّال</Chip>}
                  {t.default_on ? <Chip tone="info">شغّال افتراضيًا</Chip> : <Chip tone="muted">مقفول افتراضيًا</Chip>}
                </p>
                {t.description ? <p className="mt-1 text-sm text-muted">{t.description}</p> : null}
              </Card>
            ))}
          </div>
          <p className="mt-3 text-xs leading-5 text-muted">
            الصفحة قراءة فقط: تغيير تفضيلات أي جهاز بيتم من الجهاز نفسه وبيتسجل في جدول التفضيلات — الواجهة بتعرض الحالة المسجلة بس.
          </p>
        </>
      )}
    </div>
  )
}
