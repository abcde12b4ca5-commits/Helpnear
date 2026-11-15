# خطوات التنفيذ، بالترتيب (محدّثة من الوثائق الرسمية)

الترتيب مهم: ابدأ بـ 1 ثم 2 ثم 3 ثم 4. خطوة 5 (App Check Enforce) تتأخر أسبوع.

## 1) إيقاف النشر التلقائي من Git + ربط الاختبارات بالنشر
مشروع Pages المربوط بـ Git **لا يمكن تحويله إلى رفع مباشر (wrangler)**، فالطريقة الصحيحة هي Deploy Hook.
1. Cloudflare Dashboard > Workers & Pages > مشروعك > **Settings > Builds**.
2. في **Branch control** اطفئ **Enable automatic production branch deployments** (واجعل Preview branch = None لو مش محتاجها).
3. في نفس الصفحة: **Deploy hooks > Add deploy hook**: الاسم `github-ci`، الفرع `main`، ثم Create. انسخ الرابط (سري، كأنه كلمة سر).
4. جرّب الرابط مرة واحدة يدوياً لتتأكد أنه يعمل وهو والنشر التلقائي مطفي (هذا الجزء لم أتحقق منه في الوثائق):
   `curl -X POST "الرابط"` ثم شوف Deployments، لازم يظهر build جديد، Source = deploy hook.
5. GitHub > الـ repo > Settings > Secrets and variables > Actions:
   - Secret: `CLOUDFLARE_DEPLOY_HOOK` = الرابط
   - Variable: `DEPLOY_ENABLED` = `true`
   - (لا تحتاج `CLOUDFLARE_API_TOKEN`; متغيرات `VITE_*` تبقى في Cloudflare Pages > Settings > Variables كما هي.)
6. GitHub > Settings > Branches > Add rule لـ `main`: Require status checks: اختر الـ 4 jobs (quality, rules-and-integration, e2e, performance).
النتيجة: كل push يشغّل الاختبارات فقط. لو نجحت كلها يضرب الـ workflow الرابط فيُبنى الموقع مرة واحدة. عدد الـ builds يقل جداً (حد 500/شهر).

## 2) دومين خاص (شرط لقاعدة الـ rate limit و Bot Fight Mode)
القاعدتان تعملان على دومين داخل Cloudflare، لا على `*.pages.dev`. تكلفة الدومين فقط (سجل عادي، حوالي 10 إلى 15 دولار/سنة). الباقي مجاني.
1. اشترِ دومين (من أي مسجل، أو من Cloudflare Registrar).
2. Cloudflare > Add a domain > الخطة **Free**. غيّر الـ nameservers عند المسجل إلى اللي يعطيك إياه Cloudflare، وانتظر "Active".
3. Pages > مشروعك > **Custom domains > Set up a custom domain** > اكتب `yourdomain.com` (وكرر لـ `www`).
4. الـ Worker: Workers & Pages > helpnear-worker > **Settings > Domains & Routes > Add > Custom domain** > `api.yourdomain.com`.
5. حدّث الإعدادات (هذه الحاجات تكسر تسجيل الدخول لو نسيت واحدة):
   - `worker/wrangler.toml`: `ALLOWED_ORIGINS = "https://yourdomain.com,https://www.yourdomain.com,https://helpnear.pages.dev"` و `SITE_URL = "https://yourdomain.com"`، ثم `cd worker && npx wrangler deploy`.
   - Cloudflare Pages > Settings > Variables (Production): `VITE_WORKER_URL = https://api.yourdomain.com` و `SITE_URL = https://yourdomain.com`.
   - Turnstile > الـ widget > Hostnames: أضف `yourdomain.com` و `www.yourdomain.com`.
   - Firebase Console > Authentication > Settings > **Authorized domains**: أضف الدومين (وإلا تسجيل جوجل يفشل).
   - `public/_headers`: أضف `https://api.yourdomain.com` في `connect-src` داخل سياسة الـ CSP (وضع المراقبة).
   - Google Search Console: أضف الدومين كـ property جديدة (التحقق بـ DNS TXT أسهل).
   - ملف `.github/workflows/indexnow.yml`: راجع أن الدومين الجديد هو المستخدم. ومتغير GitHub `SITE_URL` = الدومين الجديد.
6. بعد أسبوع تأكد أن كل شيء يعمل، واجعل `helpnear.pages.dev` يحوّل للدومين الجديد (اختياري).

## 3) قاعدة Rate Limit المجانية (واحدة)
الخطة المجانية: **قاعدة واحدة، العدّ بالـ IP فقط، الفترة ثابتة 10 ثواني، والإجراء Block**. استعملها على الـ Worker لأنه هو اللي له حد 100 ألف طلب/يوم.
1. Cloudflare > اختر الدومين > **Security > WAF > Rate limiting rules > Create rule**.
2. Name: `worker-api`. Expression (Edit expression): `(http.host eq "api.yourdomain.com")`.
3. Characteristics: IP. Requests: **20**، Period: **10 seconds**، Action: **Block** (المدة تلقائياً 10 ثواني).
4. Deploy.
لماذا 20؟ مستخدم عادي يطلب توكن App Check مرة في الساعة تقريباً. 20 في 10 ثواني تتسع حتى لو عدّة أجهزة خلف نفس الواي فاي.
حدودها: تحمي من سكربت من جهاز واحد، لكن **لا** من هجوم موزّع على آلاف الـ IP. الطلبات المحجوبة تتوقف عند Cloudflare قبل الـ Worker (حسب ترتيب طبقات الأمان في الوثائق)، فلا تُحسب عليه.

## 4) Bot Fight Mode
1. Cloudflare > الدومين > **Security > Bots > Bot Fight Mode: On**.
تحذيرات حقيقية: بيتطبّق على الدومين كله، **ولا يمكن عمل استثناءات** (لا لمسار ولا لـ api.). لو صنّف جهاز على أنه بوت ممكن يمنعه من جلب توكن App Check فيفشل الدخول.
بعد التفعيل جرّب فوراً: تسجيل دخول من موبايل على بيانات الجوال (4G)، ومن متصفح خاص، ومن VPN. لو فشل شيء، اطفئه من نفس المكان. راقب Search Console 3 إلى 5 أيام للتأكد أن Googlebot لم يتأثر (الأرجح أن الـ bots الموثّقة مستثناة، لكن لم أتحقق).

## 5) تفعيل App Check على Firestore (بعد أسبوع من الاستخدام)
**قبل أي شيء** لازم الـ Worker شغّال بالكامل (راجع `worker/README.md` خطوات 1 إلى 7)، وقيم `VITE_WORKER_URL` و `VITE_TURNSTILE_SITE_KEY` موجودة في بناء الإنتاج.
1. Firebase Console > **Security > App Check > Apps** > سجّل تطبيق الويب بمزود **Custom** (لو لم يكن مسجلاً).
2. اترك Firestore على **Unenforced** واستخدم الموقع أسبوع: سجّل دخول، انشر طلب، اقبل طلب، من أجهزة مختلفة.
3. افتح **App Check > APIs > Cloud Firestore** وشوف نسب الطلبات **Verified** مقابل **Unverified**. المطلوب: Verified قريبة من 100% للمستخدمين الحقيقيين. الـ Unverified هي الاستخدام الخارجي (سكربتات) أو نسخ قديمة مخزّنة.
4. اضغط **Enforce** وأكّد. قد يستغرق حتى **15 دقيقة** حتى يسري. أي طلب بلا توكن صالح يُرفض.
5. جرّب فوراً من نافذة خاصة: افتح الموقع، سجّل دخول، انشر طلب، اقبل طلب. لو أي شيء انكسر اضغط **Unenforce** من نفس الشاشة.
6. لا تفعّل Enforce على Authentication (يتطلب ترقية Identity Platform، وغير لازم الآن).
ما يتغير بعد Enforce (مفهوم ومتحسَّب له في الكود):
- قراءة الإعدادات بطلب HTTPS بدون توكن ستُرفض (403)؛ الكود يتحول تلقائياً للقراءة عبر SDK ويحمل التوكن، ولا يعيد المحاولة بالطريقة المرفوضة.
- بناء الموقع (prerender) يقرأ التصنيفات بنفس الطلب بدون توكن، فسيرجع لملف الـ seed. معنى هذا: صفحات `/services/...` الجاهزة لمحركات البحث ستعكس التصنيفات الموجودة في `firebase/seed/data.mjs` وليس تعديلات الأدمن. لو غيّرت التصنيفات من لوحة الأدمن، حدّث ملف الـ seed أيضاً.
تحذير من `worker/README.md`: بعد Enforce لو الـ Worker وقع أو Turnstile اتغيّر، الموقع كله يتوقف. احتفظ بطريقة سريعة للتراجع (Unenforce).
