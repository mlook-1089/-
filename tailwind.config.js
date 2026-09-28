/** @type {import('tailwindcss').Config} */
// Mirrors the inline `tailwind.config` that public/index.html used with the Tailwind Play CDN.
// Build: `npm run build:css` -> public/tw.css (runs automatically before `next build`).
module.exports = {
  content: ['./public/index.html', './public/ui/*.js'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        ink: {50:'#f8fafc',100:'#f1f5f9',200:'#e2e8f0',300:'#cbd5e1',400:'#94a3b8',500:'#64748b',600:'#475569',700:'#334155',800:'#1e293b',900:'#0f172a'},
        brand: {DEFAULT:'#013856', deep:'#002B49', light:'#09598E',
                50:'#F0F4F8', 100:'#DBE7EF', 400:'#09598E', 500:'#013856', 600:'#013856', 700:'#002B49', 800:'#002B49', 900:'#013856'},
        gold: {100:'#fcf6e3',400:'#e6c05a',500:'#d4af37',600:'#b5952f',700:'#8a6b1e'},
        accent: {300:'#f5d78a',400:'#e6c05a',500:'#d4af37',600:'#b89129',700:'#8a6b1e'},
        pass: {DEFAULT:'#1B7F4B', bg:'#E2F0E8'},
        fail: {DEFAULT:'#B03038', bg:'#F8E5E6'},
        paper: '#EFF3F7',
        success: '#1B7F4B', danger: '#B03038', surface: '#F9FAFB'
      },
      fontFamily: {
        sans: ['"IBM Plex Sans Arabic"', 'Tajawal', 'sans-serif'],
        title: ['Tajawal', '"IBM Plex Sans Arabic"', 'sans-serif']
      },
      boxShadow: {
        soft: '0 2px 10px rgba(1,56,86,0.05)',
        saas: '0 2px 10px rgba(1,56,86,0.05)',
        'saas-hover': '0 6px 20px -4px rgba(1,56,86,0.12)',
        glow: '0 0 20px -5px rgba(1,56,86,0.35)'
      },
      borderRadius: { '3xl': '1.5rem', '4xl': '2rem' }
    }
  },
  // No dynamically-assembled class fragments exist in index.html (verified: no "bg-"+x / `text-${x}` patterns;
  // every classList/className value is a full literal string), so nothing needs safelisting today.
  // If you ever build class names from variables, list every possible full class name here.
  safelist: []
};
