import { useSiteData } from '../lib/data'
import {
  Card,
  Chip,
  EmptyState,
  ErrorState,
  Kv,
  LoadingState,
  PageTitle,
  TextList,
} from '../components/ui'

export default function Authority() {
  const state = useSiteData()
  if (state.phase === 'loading') return <LoadingState />
  if (state.phase === 'error') return <ErrorState message={state.message} />
  const g = state.data.governance_ref

  if (!g.available || !g.authority_model || !g.roles || !g.permission_levels) {
    return (
      <div>
        <PageTitle title="السلطة والأدوار" />
        <EmptyState text="مرجع الحوكمة (tools/governance_ref.json) غير متاح في هذه النسخة من البيانات — لا تُعرض محويات بديلة. المرجع الأصلي: docs/PGOS-STUDY.md وملف التبنّي في ops-system." />
      </div>
    )
  }

  return (
    <div>
      <PageTitle
        title="السلطة والأدوار والاعتماد"
        sub={g.meta?.pgos_version}
      />
      {g.meta ? (
        <p className="mb-4 text-xs text-muted">
          {g.meta.note} المصادر: {g.meta.source_docs.join(' · ')}
        </p>
      ) : null}

      {/* نموذج السلطة */}
      <Card className="mb-4">
        <h2 className="mb-2 font-bold">نموذج السلطة — مصدر كانوني واحد لكل فئة</h2>
        <p className="mb-3 text-sm">{g.authority_model.principle}</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted">
                <th className="py-1 text-start font-semibold">فئة المعلومات</th>
                <th className="py-1 text-start font-semibold">الكانوني عندنا</th>
                <th className="py-1 text-start font-semibold">مرايا/مراجع</th>
                <th className="py-1 text-start font-semibold">في PGOS الأصلي</th>
              </tr>
            </thead>
            <tbody>
              {g.authority_model.rows.map((r) => (
                <tr key={r.category} className="border-t border-border align-top">
                  <td className="py-2 font-semibold">{r.category}</td>
                  <td className="py-2">{r.canonical_at_us}</td>
                  <td className="py-2 text-muted">{r.mirrors}</td>
                  <td className="py-2 text-muted">{r.canonical_in_pgos}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <h3 className="mt-3 mb-1 font-bold">قواعد اختيار المصدر</h3>
        <TextList items={g.authority_model.selection_rules} />
        <h3 className="mt-3 mb-1 font-bold">ممنوع النسخ الصامت</h3>
        <p className="text-sm leading-relaxed">{g.authority_model.no_silent_mirroring}</p>
      </Card>

      {/* الفاعلون الأربعة + قناة المالك */}
      <div className="mb-4 grid gap-4 md:grid-cols-2">
        <Card>
          <h2 className="mb-2 font-bold">الفاعلون الأربعة المنفصلون</h2>
          <dl>
            {(g.principals ?? []).map((p) => (
              <Kv key={p.name} label={p.name}>
                <span className="text-sm">{p.detail}</span>
              </Kv>
            ))}
          </dl>
        </Card>
        <Card>
          <h2 className="mb-2 font-bold">قاعدة قناة المالك (DEC-PGOS-001)</h2>
          <p className="text-sm leading-relaxed">{g.owner_channel_rule}</p>
        </Card>
      </div>

      {/* الأدوار */}
      <Card className="mb-4">
        <h2 className="mb-2 font-bold">الأدوار ومصفوفة الاعتماد</h2>
        <p className="mb-3 text-sm font-semibold text-warn">
          ⚠️ {g.roles.assignment_note}
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-muted">
                <th className="py-1 text-start font-semibold">الدور (PGOS)</th>
                <th className="py-1 text-start font-semibold">المسؤولية</th>
              </tr>
            </thead>
            <tbody>
              {g.roles.pgos_roles.map((r) => (
                <tr key={r.role} className="border-t border-border align-top">
                  <td className="py-2 font-semibold" dir="ltr" style={{ textAlign: 'start' }}>
                    {r.role}
                  </td>
                  <td className="py-2">{r.responsibility}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <dl className="mt-3">
          <Kv label="عندنا عمليًا">{g.roles.at_us_chain}</Kv>
          <Kv label="الاعتماد عندنا">
            <span className="text-sm">{g.roles.approval_at_us}</span>
          </Kv>
          <Kv label="استثناء موثق">
            <span className="text-sm">{g.roles.exception_dec_pgos_003}</span>
          </Kv>
        </dl>
      </Card>

      {/* مستويات A */}
      <Card>
        <h2 className="mb-2 font-bold">مستويات صلاحية أمر الشغل A0–A4</h2>
        <p className="mb-3 text-sm text-muted">{g.permission_levels.note}</p>
        <div className="space-y-2">
          {g.permission_levels.levels.map((l) => (
            <div
              key={l.level}
              className="flex flex-col gap-1 rounded-xl bg-soft p-3 text-sm sm:flex-row sm:items-start sm:gap-3"
            >
              <span className="flex shrink-0 items-center gap-2">
                <Chip tone={l.defined ? 'info' : 'bad'}>{l.level}</Chip>
                {!l.defined ? (
                  <Chip tone="bad">غير معرّف في وثائق PGOS</Chip>
                ) : (
                  <Chip tone="ok">موثق</Chip>
                )}
              </span>
              <span className="leading-relaxed">
                {l.meaning}
                {l.approval_ref ? (
                  <span className="block text-muted">مرجع الاعتماد: {l.approval_ref}</span>
                ) : null}
              </span>
            </div>
          ))}
        </div>
        <h3 className="mt-4 mb-1 font-bold">الأفعال عالية الأثر (تتطلب A4 حتمًا)</h3>
        <div className="flex flex-wrap gap-1.5" dir="ltr">
          {g.permission_levels.high_impact_actions.map((a) => (
            <Chip key={a} tone="warn">
              {a}
            </Chip>
          ))}
        </div>
        <p className="mt-2 text-sm text-muted">{g.permission_levels.high_impact_note}</p>
      </Card>
    </div>
  )
}
