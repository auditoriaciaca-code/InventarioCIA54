import { HashRouter, NavLink, Route, Routes } from 'react-router-dom'
import EnVivo from './pages/EnVivo'
import DobleConteo from './pages/DobleConteo'
import Lotes from './pages/Lotes'
import Borrador from './pages/Borrador'
import './App.css'

export default function App() {
  return (
    <HashRouter>
      <div className="app">
        <header className="topbar">
          <div className="brand">
            <div className="brand-logo-badge">
              <img src="./logo-horizontal.png" alt="C.I. ACA — Aluminios, Cobres y Aceros SAS" className="brand-logo" />
            </div>
            <span className="subtitle">Inventario · Pesadas</span>
          </div>
          <nav className="tabs">
            <NavLink to="/" end className={({ isActive }) => (isActive ? 'tab active' : 'tab')}>
              🟢 En vivo
            </NavLink>
            <NavLink to="/doble-conteo" className={({ isActive }) => (isActive ? 'tab active' : 'tab')}>
              ⚖️ Doble conteo
            </NavLink>
            <NavLink to="/lotes" className={({ isActive }) => (isActive ? 'tab active' : 'tab')}>
              🏷️ Lotes
            </NavLink>
            <NavLink to="/borrador" className={({ isActive }) => (isActive ? 'tab active' : 'tab')}>
              📄 Borrador
            </NavLink>
          </nav>
        </header>

        <main className="content">
          <Routes>
            <Route path="/" element={<EnVivo />} />
            <Route path="/doble-conteo" element={<DobleConteo />} />
            <Route path="/lotes" element={<Lotes />} />
            <Route path="/borrador" element={<Borrador />} />
          </Routes>
        </main>
      </div>
    </HashRouter>
  )
}
