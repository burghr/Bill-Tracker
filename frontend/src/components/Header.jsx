import { NavLink } from 'react-router-dom';
import { api } from '../api/client';
import './Header.css';

export default function Header({ user, onLogout }) {
  async function handleLogout() {
    await api.logout();
    onLogout();
  }

  return (
    <header className="header">
      <div className="header-left">
        <span className="header-logo">Bills Tracker</span>
        <nav className="header-nav">
          <NavLink to="/" end className={({ isActive }) => isActive ? 'header-nav-link active' : 'header-nav-link'}>
            Bills
          </NavLink>
          <NavLink to="/debts" className={({ isActive }) => isActive ? 'header-nav-link active' : 'header-nav-link'}>
            Debts
          </NavLink>
          <NavLink to="/reports" className={({ isActive }) => isActive ? 'header-nav-link active' : 'header-nav-link'}>
            Reports
          </NavLink>
        </nav>
        <NavLink to="/profile" className={({ isActive }) => `header-user${isActive ? ' header-user-active' : ''}`}>
          @{user.username}
        </NavLink>
      </div>
      <div className="header-right">
        <button className="btn-ghost" onClick={handleLogout}>Logout</button>
      </div>
    </header>
  );
}
