import Navbar from './Navbar';
import VerifyEmailBanner from './VerifyEmailBanner';

export default function Layout({ children, withNav = true }) {
  return (
    <div className="min-h-screen bg-bg text-white">
      {withNav && <Navbar />}
      {withNav && <VerifyEmailBanner />}
      {children}
    </div>
  );
}
