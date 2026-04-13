/**
 * Footer - Site footer with About, links, and credits.
 *
 * Features:
 *  - "About" text and disclaimer
 *  - Links: GitHub, Contact, Privacy
 *  - Framer Motion hover glow/scale on links
 */
import React from 'react';
import { motion } from 'framer-motion';
import './Footer.css';

const LINKS = [
  { label: 'GitHub',   href: 'https://github.com/A13Xg/How-Sus', external: true },
  { label: 'Contact',  href: 'mailto:contact@howsus.example.com', external: false },
  { label: 'Privacy',  href: '#privacy',  external: false },
];

export default function Footer() {
  return (
    <motion.footer
      className="footer"
      role="contentinfo"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.6 }}
    >
      <div className="footer-inner">
        {/* Branding row */}
        <p className="footer-main">
          <span className="footer-logo">HowSus</span>
          <span className="footer-sep" aria-hidden="true">·</span>
          News &amp; Media Authenticity Analyzer
        </p>

        {/* Links */}
        <nav className="footer-links" aria-label="Footer links">
          {LINKS.map(({ label, href, external }) => (
            <motion.a
              key={label}
              href={href}
              className="footer-link"
              target={external ? '_blank' : undefined}
              rel={external ? 'noopener noreferrer' : undefined}
              whileHover={{ scale: 1.08, color: '#60a5fa' }}
              transition={{ duration: 0.15 }}
            >
              {label}
            </motion.a>
          ))}
        </nav>

        {/* About */}
        <p className="footer-sub">
          Fully client-side · No data leaves your browser · Results are heuristic estimates only
        </p>

        {/* Disclaimer */}
        <p className="footer-note">
          ⚠ This tool provides algorithmic analysis only and should not be used as the sole basis
          for determining the authenticity of news or media content. Always cross-reference with
          established fact-checking organisations.
        </p>

        <p className="footer-credits">
          Built with React, Framer Motion &amp; jsPDF &nbsp;·&nbsp; Open source
        </p>
      </div>
    </motion.footer>
  );
}
