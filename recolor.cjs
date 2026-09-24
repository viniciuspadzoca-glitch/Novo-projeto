// One-off recolor script: replaces hardcoded dark-theme Tailwind classes
// with the new light palette (navy/yellow/gold/red). Literal string replace only.
const fs = require('fs');
const path = require('path');

const files = [
  'src/pages/RegistroPage.jsx',
  'src/pages/PplPage.jsx',
  'src/pages/HistoricoPage.jsx',
  'src/pages/CatalogoPage.jsx',
  'src/components/BuscaPpl.jsx',
  'src/components/Comprovante.jsx',
];

// Order matters: more specific (with opacity / prefix) first.
const pairs = [
  // gradient button tokens
  ['from-amber-500', 'from-[#FFB800]'],
  ['to-amber-600', 'to-[#E5A700]'],
  ['via-yellow-500', 'via-[#FFC940]'],
  ['to-yellow-600', 'to-[#E5A700]'],
  // amber glow shadows -> yellow
  ['shadow-[0_0_15px_rgba(245,158,11,0.4)]', 'shadow-[0_0_15px_rgba(255,184,0,0.45)]'],
  ['shadow-[0_0_25px_rgba(245,158,11,0.6)]', 'shadow-[0_0_25px_rgba(255,184,0,0.6)]'],
  // slate backgrounds (dark -> light)
  ['bg-slate-950/50', 'bg-slate-100'],
  ['bg-slate-950', 'bg-slate-100'],
  ['bg-slate-900/95', 'bg-white border-l-4 border-l-[#D4A237]'],
  ['bg-slate-900/80', 'bg-white/80'],
  ['bg-slate-900/60', 'bg-slate-50'],
  ['bg-slate-900', 'bg-white'],
  ['bg-slate-800/60', 'bg-slate-100'],
  ['bg-slate-800', 'bg-slate-100'],
  // slate text
  ['text-slate-950', 'text-[#0F2232]'],
  ['text-slate-900', 'text-[#0F2232]'],
  ['text-slate-600', 'text-slate-700'],
  ['text-slate-400', 'text-slate-500'],
  ['text-slate-300', 'text-slate-600'],
  // slate borders
  ['border-slate-300', 'border-[#D4A237]'],
  ['border-slate-600', 'border-slate-300'],
  // amber backgrounds
  ['bg-amber-500/20', 'bg-[#FFB800]/20'],
  ['bg-amber-500/10', 'bg-[#FFB800]/10'],
  ['bg-amber-500', 'bg-[#FFB800]'],
  ['bg-amber-950/60', 'bg-[#FFB800]/20'],
  ['bg-amber-950/40', 'bg-[#FFB800]/15'],
  ['bg-amber-950', 'bg-[#FFB800]/15'],
  ['bg-amber-200', 'bg-[#FFB800]/20'],
  ['bg-amber-100', 'bg-[#FFB800]/15'],
  // amber borders -> gold
  ['border-amber-500/50', 'border-[#D4A237]/60'],
  ['border-amber-500/40', 'border-[#D4A237]/60'],
  ['border-amber-500/30', 'border-[#D4A237]/50'],
  ['border-amber-500/20', 'border-[#D4A237]/40'],
  ['border-amber-500', 'border-[#D4A237]'],
  ['border-amber-300', 'border-[#D4A237]'],
  // amber ring / shadow
  ['ring-amber-500/40', 'ring-[#D4A237]/60'],
  ['ring-amber-500', 'ring-[#D4A237]'],
  ['shadow-amber-500/30', 'shadow-[#FFB800]/30'],
  // amber text -> navy (on light bg)
  ['text-amber-400', 'text-[#0F2232]'],
  ['text-amber-300', 'text-[#0F2232]'],
  ['text-amber-700', 'text-[#0F2232]'],
  ['text-amber-900', 'text-[#0F2232]'],
  ['text-amber-200', 'text-[#0F2232]'],
  // emerald (success/active -> green, light-theme shades)
  ['text-emerald-400', 'text-emerald-600'],
  ['text-emerald-300', 'text-emerald-600'],
  ['text-emerald-900', 'text-emerald-800'],
  ['border-emerald-500/40', 'border-emerald-500/60'],
  ['border-emerald-300', 'border-emerald-500'],
  ['bg-emerald-950/40', 'bg-emerald-50'],
  ['bg-emerald-500/20', 'bg-emerald-500/15'],
  // rose (alert -> brand red)
  ['text-rose-400', 'text-[#D9381E]'],
  ['text-rose-300', 'text-[#D9381E]'],
  ['border-rose-500/40', 'border-[#D9381E]/60'],
  ['bg-rose-950/50', 'bg-[#D9381E]/10'],
  ['bg-rose-950/40', 'bg-[#D9381E]/10'],
  ['bg-rose-950/30', 'bg-[#D9381E]/10'],
  // red (alert -> brand red)
  ['bg-red-950/60', 'bg-[#D9381E]/10'],
  ['bg-red-950/50', 'bg-[#D9381E]/10'],
  ['bg-red-950/30', 'bg-[#D9381E]/10'],
  ['bg-red-50/80', 'bg-[#D9381E]/10'],
  ['bg-red-50', 'bg-[#D9381E]/10'],
  ['border-red-500/60', 'border-[#D9381E]'],
  ['border-red-500/40', 'border-[#D9381E]/60'],
  ['border-red-400', 'border-[#D9381E]'],
  ['border-red-600', 'border-[#D9381E]'],
  ['ring-red-400', 'ring-[#D9381E]'],
  ['ring-offset-red-600', 'ring-offset-[#D9381E]'],
  ['text-red-900', 'text-[#D9381E]'],
  ['text-red-700', 'text-[#D9381E]'],
  ['text-red-600', 'text-[#D9381E]'],
  ['text-red-400', 'text-[#D9381E]'],
  ['text-red-300', 'text-[#D9381E]'],
  ['text-red-50', 'text-white'],
];

const root = __dirname;
let totalChanges = 0;
for (const rel of files) {
  const fp = path.join(root, rel);
  if (!fs.existsSync(fp)) { console.log('SKIP missing', rel); continue; }
  let src = fs.readFileSync(fp, 'utf8');
  let count = 0;
  for (const [a, b] of pairs) {
    if (src.includes(a)) {
      const occurrences = src.split(a).length - 1;
      src = src.split(a).join(b);
      count += occurrences;
    }
  }
  fs.writeFileSync(fp, src);
  totalChanges += count;
  console.log(`${rel}: ${count} replacements`);
}
console.log('TOTAL', totalChanges);
