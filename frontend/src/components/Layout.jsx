import Navbar from './Navbar';
import VerifyEmailBanner from './VerifyEmailBanner';
import AnnouncementBanner from './AnnouncementBanner';

export default function Layout({ children, withNav = true }) {
  return (
    <div className="min-h-screen bg-bg text-white">
      {withNav && <Navbar />}
      {withNav && <VerifyEmailBanner />}
      {withNav && <AnnouncementBanner />}
      {children}
    </div>
  );
}
