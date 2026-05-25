import Navbar from './Navbar';

export default function Layout({ children, withNav = true }) {
  return (
    <div className="min-h-screen bg-bg text-white">
      {withNav && <Navbar />}
      {children}
    </div>
  );
}
