import { Link } from 'react-router-dom'

export default function Footer() {
  return (
    <footer className="border-t border-[#21262d] py-10 mt-20">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center">
            <span className="text-white text-xs font-bold font-mono">kb</span>
          </div>
          <span className="text-sm text-slate-500 font-mono">
            omykb — MIT License
          </span>
        </div>
        <nav className="flex items-center gap-5 text-sm text-slate-500">
          <Link to="/docs" className="hover:text-slate-300 transition-colors">Docs</Link>
          <Link to="/skills" className="hover:text-slate-300 transition-colors">Skills</Link>
          <a href="https://github.com/omykb/omykb" target="_blank" rel="noopener noreferrer" className="hover:text-slate-300 transition-colors">
            GitHub
          </a>
        </nav>
      </div>
    </footer>
  )
}
