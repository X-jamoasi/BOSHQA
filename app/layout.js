import '@fontsource-variable/inter';
import './style.css';

export const metadata = {
  title: 'BOSHQA — Ombor va buyurtmalar',
  description: 'Ishlab chiqarish korxonalari uchun ombor va buyurtma boshqaruvi',
};

export default function Layout({ children }) {
  return <html lang="uz"><body>{children}</body></html>;
}
