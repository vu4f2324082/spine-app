<script lang="ts">
  import Spine3D from '$lib/components/Spine3D.svelte';
  import { slide } from 'svelte/transition';
  let openSection = $state<string | null>(null);

  const sections = [
    {
      id: 'what-is-spine-surgery',
      title: '🦴 What Is Spine Surgery?',
      content: `Spine surgery is a medical procedure performed to correct problems in the spinal column — the bones (vertebrae), discs, nerves, and tissues that make up your back and neck.

Common reasons for spine surgery include:
• Herniated or slipped discs pressing on nerves
• Spinal stenosis (narrowing of the spinal canal)
• Degenerative disc disease
• Scoliosis (abnormal curvature of the spine)
• Fractures from injury or osteoporosis
• Instability or alignment problems

Most spine surgeries today are minimally invasive, meaning smaller incisions, less blood loss, and faster recovery times compared to traditional open surgery.`
    },
    {
      id: 'before-surgery',
      title: '📋 What to Expect Before Surgery',
      content: `Preparation is an important part of your surgical journey:

Before your surgery date:
• Your surgeon will conduct imaging tests (MRI, CT scan, X-rays)
• Blood tests and physical evaluation will be done
• You may be asked to stop certain medications (like blood thinners)
• Avoid eating or drinking after midnight before surgery
• Arrange for someone to drive you home and assist you for the first 1–2 weeks
• Set up a comfortable recovery space at home with essentials within reach
• Ask your doctor all your questions — no question is too small

Mental preparation matters too. It's normal to feel anxious. Talk to your care team about any concerns.`
    },
    {
      id: 'after-surgery',
      title: '🏥 What to Expect After Surgery',
      content: `Immediately after surgery:
• You will be in a recovery room while anesthesia wears off
• Nurses will monitor your pain, vital signs, and movement
• You may have a urinary catheter temporarily
• Most patients stay 1–3 nights in hospital (varies by procedure)

First few weeks at home:
• Pain and discomfort are normal — take medications as prescribed
• Keep the incision site clean and dry
• Avoid heavy lifting, bending, or twisting
• Walk short distances several times a day to prevent blood clots
• Sleep on your back or side with a pillow between your knees
• Attend all follow-up appointments

Remember: Recovery is a process, not a race. Everyone heals at their own pace.`
    },
    {
      id: 'dos-donts',
      title: '✅ Recovery Do\'s and Don\'ts',
      content: `DO:
✓ Follow your prescribed medication schedule
✓ Walk regularly — short, gentle walks multiple times a day
✓ Sleep on a firm mattress with proper back support
✓ Use ice packs wrapped in cloth for swelling (20 minutes at a time)
✓ Eat nutritious foods rich in protein and vitamins for healing
✓ Stay hydrated — drink 8+ glasses of water daily
✓ Log your symptoms and share them with your doctor
✓ Complete all physiotherapy exercises as instructed
✓ Ask for help — don't try to do everything yourself

DON'T:
✗ Lift anything heavier than a glass of water (early stage)
✗ Bend at the waist — bend at your knees instead (log roll technique)
✗ Twist your torso, especially after spinal fusion
✗ Sit or stand in one position for too long
✗ Skip physiotherapy sessions — consistency matters greatly
✗ Drive until your surgeon clears you (usually 4–6 weeks)
✗ Smoke — it significantly slows bone healing
✗ Ignore new or worsening symptoms`
    },
    {
      id: 'physio-tips',
      title: '💪 Physiotherapy Tips',
      content: `Physiotherapy is one of the most important parts of your recovery. It helps you:
• Regain strength and flexibility
• Reduce pain and inflammation
• Prevent re-injury
• Return to normal activities safely

Key principles:
• Start slowly — gentle movement beats no movement
• Consistency beats intensity — do a little every day
• Listen to your body — some discomfort is normal, sharp pain is not
• Breathing: exhale during exertion, inhale during rest
• Warm up before exercises and cool down after

Common early exercises include:
• Ankle pumps (in bed)
• Gentle walking
• Heel slides
• Diaphragmatic breathing
• Isometric abdominal contractions

Your SpineGuide AI can suggest specific exercises based on your surgery type and recovery stage. Use the Physiotherapy section to get your personalized plan.`
    },
    {
      id: 'contact-doctor',
      title: '🚨 When to Contact Your Doctor',
      content: `Contact your healthcare provider immediately if you experience:

Emergency symptoms (call 999/911 or go to A&E):
⚡ Sudden weakness or paralysis in your legs
⚡ Loss of bladder or bowel control
⚡ Severe chest pain or difficulty breathing
⚡ High fever with stiff neck
⚡ Sudden severe headache unlike any before

Contact your surgeon or GP urgently:
⚠ Increased redness, warmth, or swelling at the incision site
⚠ Pus or unusual discharge from the wound
⚠ Fever above 38°C (100.4°F)
⚠ Pain that is significantly worse than before surgery
⚠ Numbness or tingling spreading to new areas
⚠ Inability to control pain with prescribed medications

General concerns to raise at your next appointment:
• New or changing symptoms
• Questions about medications or exercises
• Concerns about your recovery progress

Remember: It is always better to call and check than to wait and worry. Your care team is there to help you.`
    },
    {
      id: 'surgery-types',
      title: '🔬 Common Spine Surgery Types',
      content: `Understanding your surgery helps you recover better:

Discectomy / Microdiscectomy:
Removes part of a herniated disc pressing on a nerve. Often done for sciatica. Recovery: 4–6 weeks to light activity.

Spinal Fusion:
Joins two or more vertebrae permanently to stop movement at a painful joint. Recovery: 3–6 months to return to full activity.

Laminectomy / Laminotomy:
Removes part of a vertebra (lamina) to relieve pressure on the spinal cord or nerves. Often used for spinal stenosis. Recovery: 4–8 weeks.

ACDF (Anterior Cervical Discectomy and Fusion):
Removes a damaged cervical disc through the front of the neck and fuses the vertebrae. Recovery: 4–6 weeks for most activities.

Vertebroplasty / Kyphoplasty:
Injects bone cement into fractured vertebrae, often from osteoporosis. Recovery: 1–2 days, with gradual activity increase.

Every surgery and every patient is unique. Always follow your specific surgeon's recovery guidelines.`
    }
  ];

  function toggle(id: string) {
    openSection = openSection === id ? null : id;
  }
</script>

<svelte:head><title>Education – SpineSync</title></svelte:head>

<!-- Full-bleed 3D Interactive Spine Section -->
<div class="w-full bg-slate-50/50 backdrop-blur-xl overflow-hidden relative shadow-[inset_0_0_80px_rgba(0,0,0,0.02)] border-b border-slate-200 mb-10 h-[70vh] min-h-[500px]">
  <div class="absolute top-6 left-6 z-10 max-w-sm">
    <div class="bg-white/80 backdrop-blur-md border border-slate-200/60 px-4 py-2.5 rounded-2xl shadow-xl">
      <h2 class="text-slate-800 font-bold text-lg mb-1 flex items-center gap-2">
        <span class="w-2 h-2 rounded-full bg-blue-500 animate-pulse ring-4 ring-blue-500/20"></span>
        Interactive Spine Anatomy
      </h2>
      <p class="text-slate-500 text-xs leading-relaxed">Hover over individual vertebrae to explore regions, functions, and common surgical procedures. Use your mouse to rotate and zoom.</p>
    </div>
  </div>
  <Spine3D />
  <div class="absolute bottom-6 right-6 z-10 bg-white/80 backdrop-blur-md border border-slate-200/60 px-4 py-3 rounded-2xl flex items-center gap-4 text-xs font-semibold text-slate-700 shadow-xl">
      <div class="flex items-center gap-2">
          <span class="w-3 h-3 rounded-full bg-[#eae6df] shadow-inner border border-slate-300"></span> Normal
      </div>
      <div class="flex items-center gap-2">
          <span class="w-3 h-3 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.4)]"></span> Selected
      </div>
  </div>
</div>

<div class="space-y-6 animate-fade-in max-w-3xl mx-auto px-4 sm:px-0">
  <!-- Header -->
  <div>
    <h1 class="page-title">Patient Education Library</h1>
    <p class="text-muted text-sm mt-1 mb-6">Learn about spine surgery and recovery in clear, simple language</p>
  </div>

  <!-- Search hint -->
  <div class="card bg-primary/5 border-primary/20">
    <p class="text-sm text-black">
      <strong>📚 About this library:</strong> All content is written in plain language to help you understand your condition and recovery. For specific medical advice, always consult your healthcare provider.
    </p>
  </div>

  <!-- Futuristic Hover Accordions -->
  <div class="space-y-4 relative z-10" role="list">
    {#each sections as section}
      <div 
        class="group relative overflow-hidden rounded-2xl bg-white/60 backdrop-blur-xl border border-slate-200/50 shadow-md hover:shadow-2xl hover:-translate-y-1 hover:border-blue-400/40 hover:bg-white/90 transition-all duration-300 outline-none"
        onpointerenter={(e) => { if (e.pointerType === 'mouse') openSection = section.id; }}
        onpointerleave={(e) => { if (e.pointerType === 'mouse') openSection = null; }}
        role="button"
        tabindex="0"
        aria-expanded={openSection === section.id}
        onclick={() => toggle(section.id)}
        onkeydown={(e) => e.key === 'Enter' && toggle(section.id)}
      >
        <div class="absolute inset-0 bg-gradient-to-r from-blue-50/0 to-blue-50/50 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"></div>
        
        <div class="relative w-full text-left px-6 py-5 flex items-center justify-between z-10 transition-colors">
          <span class="font-bold text-slate-800 tracking-tight group-hover:text-blue-700 drop-shadow-sm transition-colors">{section.title}</span>
          <div class="w-10 h-10 rounded-full bg-slate-100/50 backdrop-blur shadow-inner group-hover:bg-blue-600 flex items-center justify-center transition-colors duration-300">
              <span class="text-slate-500 group-hover:text-white font-medium text-xl transition-transform duration-500 {openSection === section.id ? 'rotate-45' : ''}">+</span>
          </div>
        </div>
        
        {#if openSection === section.id}
          <div class="relative px-6 pb-6 pt-2 border-t border-slate-200/40 z-10" transition:slide={{ duration: 400, axis: 'y' }}>
            <div class="prose prose-sm max-w-none text-slate-600 whitespace-pre-line leading-relaxed font-medium">
              {section.content}
            </div>
          </div>
        {/if}
      </div>
    {/each}
  </div>

  <!-- More Resources -->
  <div class="card">
    <h2 class="section-title mb-3">Need More Help?</h2>
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <a href="/assistant" class="card-hover p-4 text-center group">
        <div class="text-2xl mb-2">🤖</div>
        <p class="text-sm font-medium group-hover:text-primary transition-colors">Ask SpineGuide AI</p>
        <p class="text-xs text-muted mt-1">Get instant answers to your recovery questions</p>
      </a>
      <a href="/physiotherapy" class="card-hover p-4 text-center group">
        <div class="text-2xl mb-2">💪</div>
        <p class="text-sm font-medium group-hover:text-primary transition-colors">Get Exercise Plan</p>
        <p class="text-xs text-muted mt-1">Personalized physiotherapy for your surgery type</p>
      </a>
      <a href="/monitoring" class="card-hover p-4 text-center group">
        <div class="text-2xl mb-2">📊</div>
        <p class="text-sm font-medium group-hover:text-primary transition-colors">Track Progress</p>
        <p class="text-xs text-muted mt-1">Log daily symptoms and monitor your recovery</p>
      </a>
    </div>
  </div>

  <div class="disclaimer">
    <strong>Medical Disclaimer:</strong> This educational content is for informational purposes only. It does not constitute medical advice and should not be used as a substitute for professional healthcare guidance. Always follow your doctor's specific instructions.
  </div>
</div>
