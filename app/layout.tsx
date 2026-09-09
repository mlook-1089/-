export const metadata = { title: 'حلقة ابن كثير — منصة رصد' };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (<html lang="ar" dir="rtl"><body>{children}</body></html>);
}
