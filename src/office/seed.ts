import type { OfficeData } from './types'

/*
 * بيانات أولية (seed) للمقر الافتراضي — سجلات بيانات عادية، مش هيكل محروق.
 * عند ربط الداتابيز الحية تُستبدل دي بسجلات pgos_departments / pgos_employees
 * من غير أي تغيير في طبقة العرض.
 */
export const officeSeed: OfficeData = {
  departments: [
    { id: 'dept-ops', name: 'الإدارة والعمليات', color: '#FFA726' },
    { id: 'dept-product', name: 'تطوير المنتجات', color: '#00D2FF' },
    { id: 'dept-qa', name: 'الجودة والمراجعة', color: '#34D399' },
    { id: 'dept-rnd', name: 'البحث والتطوير', color: '#B388FF' },
    { id: 'dept-marketing', name: 'التسويق والسوشيال', color: '#FF7BAC' },
    { id: 'dept-support', name: 'الدعم والمتابعة', color: '#FFD54F' },
  ],
  employees: [
    // الإدارة والعمليات
    { id: 'emp-01', name: 'ليان حسن', role: 'منسقة عمليات', department_id: 'dept-ops', desk: 1, status: 'working', tools: ['Slack', 'Linear'], current_task: 'تقرير حالة الشركة الأسبوعي', tasks_open: 4, projects: 2, rating: 4.8 },
    { id: 'emp-02', name: 'عمر فاروق', role: 'مسؤول متابعة المهام', department_id: 'dept-ops', desk: 2, status: 'working', tools: ['Linear'], current_task: 'توزيع مهام اليوم على المسارات', tasks_open: 7, projects: 3, rating: 4.6 },
    { id: 'emp-03', name: 'سلمى نبيل', role: 'مسؤولة السجل والقيود', department_id: 'dept-ops', desk: 3, status: 'idle', tools: ['Drive', 'Slack'], tasks_open: 0, projects: 1, rating: 4.9 },
    { id: 'emp-04', name: 'كريم وائل', role: 'منسق اجتماعات', department_id: 'dept-ops', desk: 4, status: 'offline', tools: ['Calendar'], tasks_open: 2, projects: 1, rating: 4.4 },
    // تطوير المنتجات
    { id: 'emp-05', name: 'يوسف عادل', role: 'مطور واجهات', department_id: 'dept-product', desk: 1, status: 'working', tools: ['GitHub', 'Vercel'], current_task: 'واجهة المقر الافتراضي — المشهد', tasks_open: 5, projects: 2, rating: 4.7 },
    { id: 'emp-06', name: 'مريم سامح', role: 'مطورة خلفية', department_id: 'dept-product', desk: 2, status: 'working', tools: ['GitHub', 'Supabase'], current_task: 'طبقة البيانات الديناميكية', tasks_open: 6, projects: 2, rating: 4.8 },
    { id: 'emp-07', name: 'آدم رضا', role: 'مطور تطبيقات', department_id: 'dept-product', desk: 3, status: 'working', tools: ['GitHub'], current_task: 'إصلاحات دفعة الواجهة', tasks_open: 3, projects: 1, rating: 4.5 },
    { id: 'emp-08', name: 'حبيبة طارق', role: 'مهندسة بيانات', department_id: 'dept-product', desk: 4, status: 'idle', tools: ['Supabase'], tasks_open: 0, projects: 2, rating: 4.6 },
    { id: 'emp-09', name: 'زياد منير', role: 'مطور تكاملات', department_id: 'dept-product', desk: 5, status: 'working', tools: ['GitHub', 'Slack'], current_task: 'ربط إشعارات سلاك', tasks_open: 4, projects: 1, rating: 4.3 },
    // الجودة والمراجعة
    { id: 'emp-10', name: 'نور الدين علي', role: 'مراجع كود', department_id: 'dept-qa', desk: 1, status: 'working', tools: ['GitHub'], current_task: 'مراجعة طلبات الدمج المفتوحة', tasks_open: 8, projects: 4, rating: 4.9 },
    { id: 'emp-11', name: 'فرح إسلام', role: 'مهندسة اختبارات', department_id: 'dept-qa', desk: 2, status: 'working', tools: ['GitHub', 'Linear'], current_task: 'فحص الـ45 نقطة — مستر', tasks_open: 5, projects: 2, rating: 4.7 },
    { id: 'emp-12', name: 'بلال حسان', role: 'مراجع تصميم قواعد بيانات', department_id: 'dept-qa', desk: 3, status: 'idle', tools: ['Supabase'], tasks_open: 0, projects: 1, rating: 4.5 },
    // البحث والتطوير
    { id: 'emp-13', name: 'رنا خليل', role: 'باحثة أدوات ذكاء اصطناعي', department_id: 'dept-rnd', desk: 1, status: 'working', tools: ['Linear', 'Drive'], current_task: 'دورة بحث — وكلاء الخلفية', tasks_open: 6, projects: 3, rating: 4.8 },
    { id: 'emp-14', name: 'سامر نديم', role: 'باحث منتجات', department_id: 'dept-rnd', desk: 2, status: 'working', tools: ['Drive'], current_task: 'مقارنة منصات إدارة الحضانات', tasks_open: 3, projects: 2, rating: 4.4 },
    { id: 'emp-15', name: 'دينا عماد', role: 'محللة تجارب', department_id: 'dept-rnd', desk: 3, status: 'offline', tools: ['Linear'], tasks_open: 1, projects: 1, rating: 4.2 },
    { id: 'emp-16', name: 'هشام رامي', role: 'باحث تقني', department_id: 'dept-rnd', desk: 4, status: 'working', tools: ['GitHub', 'Drive'], current_task: 'تقييم محركات العرض ثلاثي الأبعاد', tasks_open: 4, projects: 2, rating: 4.6 },
    // التسويق والسوشيال
    { id: 'emp-17', name: 'تالا سمير', role: 'صانعة محتوى', department_id: 'dept-marketing', desk: 1, status: 'working', tools: ['Instagram', 'Drive'], current_task: 'سكربت فيديو إطلاق مستر', tasks_open: 5, projects: 2, rating: 4.7 },
    { id: 'emp-18', name: 'جنى وليد', role: 'مصممة سوشيال', department_id: 'dept-marketing', desk: 2, status: 'idle', tools: ['Drive'], tasks_open: 0, projects: 1, rating: 4.5 },
    { id: 'emp-19', name: 'مالك شريف', role: 'مسؤول حملات', department_id: 'dept-marketing', desk: 3, status: 'working', tools: ['Instagram', 'Slack'], current_task: 'خطة محتوى الأسبوع', tasks_open: 4, projects: 3, rating: 4.3 },
    // الدعم والمتابعة
    { id: 'emp-20', name: 'ريم أشرف', role: 'مسؤولة دعم العملاء', department_id: 'dept-support', desk: 1, status: 'working', tools: ['Slack', 'WhatsApp'], current_task: 'الرد على استفسارات المدرسين', tasks_open: 9, projects: 2, rating: 4.9 },
    { id: 'emp-21', name: 'طارق زياد', role: 'مسؤول متابعة التنبيهات', department_id: 'dept-support', desk: 2, status: 'working', tools: ['Slack'], current_task: 'مراقبة تنبيهات النظام', tasks_open: 3, projects: 1, rating: 4.4 },
    { id: 'emp-22', name: 'هنا محمود', role: 'منسقة نجاح العملاء', department_id: 'dept-support', desk: 3, status: 'idle', tools: ['WhatsApp', 'Drive'], tasks_open: 0, projects: 2, rating: 4.6 },
  ],
}
