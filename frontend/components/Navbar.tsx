"use client";

import { useState } from "react";
import Link from "next/link";

const CATEGORY_TABS = [
  { key: "all", label: "All", href: "/" },
  { key: "crypto", label: "Crypto", href: "/?cat=crypto" },
  { key: "forex", label: "Forex", href: "/?cat=forex" },
  { key: "usmarket", label: "US Market", href: "/?cat=usmarket" },
  { key: "press", label: "Press Release", href: "/?cat=press" },
];

export default function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <nav className="cp-navbar">
      <div className="cp-navbar-inner">
        {/* Left: Brand */}
        <Link href="/" className="cp-navbar-brand">
          Chain<span className="cp-brand-dot">.</span>Pulse
        </Link>

        {/* Center: Desktop tabs */}
        <div className="cp-navbar-tabs">
          {CATEGORY_TABS.map((tab) => (
            <Link key={tab.key} href={tab.href} className="cp-navbar-tab">
              {tab.label}
            </Link>
          ))}
        </div>

        {/* Right: Search + Auth */}
        <div className="cp-navbar-right">
          <Link href="/search" className="cp-navbar-search" title="Search">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </Link>
          <Link href="/login" className="cp-navbar-login">
            Log In
          </Link>
          <Link href="/signup" className="cp-navbar-signup">
            Sign Up
          </Link>

          {/* Mobile menu toggle */}
          <button
            className="cp-navbar-burger"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="Toggle menu"
          >
            {menuOpen ? (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            ) : (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Mobile dropdown */}
      {menuOpen && (
        <div className="cp-mobile-menu">
          {CATEGORY_TABS.map((tab) => (
            <Link
              key={tab.key}
              href={tab.href}
              className="cp-mobile-link"
              onClick={() => setMenuOpen(false)}
            >
              {tab.label}
            </Link>
          ))}
          <div className="cp-mobile-divider" />
          <Link href="/search" className="cp-mobile-link" onClick={() => setMenuOpen(false)}>
            Search
          </Link>
          <Link href="/login" className="cp-mobile-link" onClick={() => setMenuOpen(false)}>
            Log In
          </Link>
          <Link href="/signup" className="cp-mobile-link cp-mobile-signup" onClick={() => setMenuOpen(false)}>
            Sign Up
          </Link>
        </div>
      )}
    </nav>
  );
}
