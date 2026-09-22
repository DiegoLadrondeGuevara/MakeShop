import React from 'react';
import { Users, Settings, LayoutDashboard, Store, BarChart3 } from 'lucide-react';
import { NavLink } from 'react-router-dom';

export const Sidebar: React.FC = () => {
  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <Store size={28} />
        <span>Make</span>Shop
      </div>
      
      <nav style={{ flex: 1 }}>  
        
        <NavLink to="/owner" className={({ isActive }: { isActive: boolean }) => `nav-item ${isActive ? 'active' : ''}`}>
          <LayoutDashboard size={20} />
          <span>Dashboard</span>
        </NavLink>

        <NavLink to="/owner/analytics" className={({ isActive }: { isActive: boolean }) => `nav-item ${isActive ? 'active' : ''}`}>
          <BarChart3 size={20} />
          <span>Analytics</span>
        </NavLink>

        <NavLink to="/admin" className={({ isActive }: { isActive: boolean }) => `nav-item ${isActive ? 'active' : ''}`}>
          <Users size={20} />
          <span>Clients</span>
        </NavLink>
      </nav>

      <div style={{ marginTop: 'auto', borderTop: '1px solid var(--border-color)', paddingTop: '1rem' }}>
        <NavLink to="/profile" className={({ isActive }: { isActive: boolean }) => `nav-item ${isActive ? 'active' : ''}`}>
          <Settings size={20} />
          <span>Settings</span>
        </NavLink>
      </div>
    </aside>
  );
};
