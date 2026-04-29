import * as fs from 'fs';

const file = 'src/app/avatar/new/page.tsx';
let content = fs.readFileSync(file, 'utf8');

const STEPS = `
  const STEPS = [
    { id: 1, title: 'Describe', desc: 'Avatar details' },
    { id: 2, title: 'Preview', desc: 'Review generation' },
    { id: 3, title: 'Refine', desc: 'Script & Voice' },
  ];
`;

const PROGRESS = `
      <div className="mx-auto max-w-4xl px-6 py-8">
        
        {/* Progress Indicator */}
        <div className="mb-10">
          <div className="flex items-center justify-between relative">
            <div className="absolute left-0 top-1/2 -translate-y-1/2 w-full h-1 bg-slate-200 rounded-full z-0"></div>
            <div 
              className="absolute left-0 top-1/2 -translate-y-1/2 h-1 bg-violet-600 rounded-full z-0 transition-all duration-500 ease-in-out" 
              style={{ width: \`\${((currentStep - 1) / (STEPS.length - 1)) * 100}%\` }}
            ></div>
            
            {STEPS.map((step) => {
              const isActive = currentStep === step.id;
              const isPast = currentStep > step.id;
              return (
                <div key={step.id} className="relative z-10 flex flex-col items-center gap-2 bg-[#F9FAFB] px-2">
                  <div 
                    className={\`flex h-10 w-10 items-center justify-center rounded-full border-2 font-bold transition-colors \${
                      isActive ? 'border-violet-600 bg-violet-600 text-white shadow-md shadow-violet-200' :
                      isPast ? 'border-violet-600 bg-white text-violet-600' :
                      'border-slate-300 bg-white text-slate-400'
                    }\`}
                  >
                    {isPast ? (
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      step.id
                    )}
                  </div>
                  <div className="text-center">
                    <div className={\`text-sm font-semibold \${isActive || isPast ? 'text-slate-900' : 'text-slate-400'}\`}>
                      {step.title}
                    </div>
                    <div className="text-xs text-slate-500 hidden sm:block">{step.desc}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden min-h-[500px]">
          {/* STEP 1: DESCRIBE */}
          {currentStep === 1 && (
            <div className="p-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="mb-6 flex flex-col items-center text-center">
                <div className="h-24 w-24 rounded-full bg-violet-100 flex items-center justify-center mb-4">
                  <svg className="h-12 w-12 text-violet-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                </div>
                <h2 className="text-2xl font-bold text-slate-800">Let's create your Avatar</h2>
                <p className="text-slate-500 mt-2 max-w-md mx-auto">
                  Describe what your presenter should look like. We'll generate a high-quality avatar for your videos.
                </p>
              </div>
              
              <div className="flex flex-col gap-5 max-w-2xl mx-auto">
                <div className="rounded-xl border border-slate-200 p-5 bg-slate-50">
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Avatar description
                  </label>
                  <textarea
                    rows={4}
                    value={avatarPrompt}
                    onChange={(e) => setAvatarPrompt(e.target.value)}
                    placeholder="e.g. Professional woman in her 30s, confident expression, plain grey background"
                    className="w-full resize-y rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 placeholder-slate-400 text-sm focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-100 transition"
                    disabled={isGeneratingAvatar}
                  />
`;

// we will just use replace_in_file carefully.

export { content, STEPS, PROGRESS };
