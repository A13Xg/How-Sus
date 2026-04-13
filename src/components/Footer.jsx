import React from 'react';
import { motion } from 'framer-motion';
import './Footer.css';

export default function Footer() {
  return (
    <motion.footer
      className="footer"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.5 }}
    >
      <div className="footer-inner">
        <p className="footer-main">
          <span className="footer-logo">HowSus</span>
          <span className="footer-sep">·</span>
          News & Media Authenticity Analyzer
        </p>
        <p className="footer-sub">
          Fully client-side · No data leaves your browser · Results are algorithmic estimates only
        </p>
        <p className="footer-note">
          ⚠ This tool provides heuristic analysis only and should not be used as the sole basis for determining the authenticity of news or media.
        </p>
      </div>
    </motion.footer>
  );
}
