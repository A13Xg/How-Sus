/**
 * NetworkGraph - Interactive canvas-based network graph for duplicate-source detection.
 *
 * Nodes expand and highlight on hover.  The central "SRC" node pulses continuously.
 * Each satellite node is colour-coded by similarity score
 *   red  ≥ 80%  |  amber  ≥ 65%  |  green  < 65%
 *
 * Props:
 *   duplicates {Array<{source, matchPercentage|similarity, date}>} - source data
 *   animate    {boolean} - enable continuous pulse animation (default true)
 */
import React, { useEffect, useRef } from 'react';
import './NetworkGraph.css';

export default function NetworkGraph({ duplicates = [], animate = true }) {
  const canvasRef = useRef(null);
  const hoveredRef = useRef(null);
  const nodesRef = useRef([]);
  const rafRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    // Hi-DPI support
    const dpr = window.devicePixelRatio || 1;
    const W = canvas.clientWidth || 300;
    const H = canvas.clientHeight || 220;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.scale(dpr, dpr);

    const cx = W / 2;
    const cy = H / 2;
    const MAX_NODES = 7;
    const items = duplicates.slice(0, MAX_NODES);

    // Build node list (centre + satellites)
    const nodes = [
      { x: cx, y: cy, label: 'Source', r: 20, color: '#3b82f6', main: true },
      ...items.map((d, i) => {
        const similarity = d.matchPercentage ?? d.similarity ?? 70;
        const angle = (i / items.length) * Math.PI * 2 - Math.PI / 2;
        const dist = Math.min(W, H) * 0.34;
        return {
          x: cx + Math.cos(angle) * dist,
          y: cy + Math.sin(angle) * dist,
          label: d.source ?? d.url ?? 'Unknown',
          r: 12,
          color: similarity >= 80 ? '#ef4444' : similarity >= 65 ? '#f59e0b' : '#10b981',
          similarity,
          date: d.date ?? '',
        };
      }),
    ];
    nodesRef.current = nodes;

    let t = 0;

    const draw = () => {
      ctx.clearRect(0, 0, W, H);
      t += animate ? 0.025 : 0;

      // ── Edges ──────────────────────────────────────────────────────────
      nodes.slice(1).forEach((node) => {
        ctx.beginPath();
        ctx.moveTo(nodes[0].x, nodes[0].y);
        ctx.lineTo(node.x, node.y);
        ctx.strokeStyle = node.color + '44';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 6]);
        ctx.stroke();
        ctx.setLineDash([]);
      });

      // ── Nodes ─────────────────────────────────────────────────────────
      nodes.forEach((node, i) => {
        const hovered = hoveredRef.current === i;
        const pulse = node.main && animate ? Math.sin(t * 2) * 3 : 0;
        const r = node.r + pulse + (hovered ? 6 : 0);

        // Outer glow ring
        ctx.beginPath();
        ctx.arc(node.x, node.y, r + 7, 0, Math.PI * 2);
        ctx.fillStyle = node.color + (hovered ? '55' : '22');
        ctx.fill();

        // Node fill
        ctx.beginPath();
        ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
        ctx.fillStyle = node.color;
        ctx.fill();

        // Inner text
        ctx.font = `${node.main ? 'bold ' : ''}9px Inter,sans-serif`;
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(node.main ? 'SRC' : node.similarity + '%', node.x, node.y);
        ctx.textBaseline = 'alphabetic';

        // External label below satellite nodes
        if (!node.main) {
          ctx.font = '9px Inter,sans-serif';
          ctx.fillStyle = hovered ? '#f1f5f9' : '#94a3b8';
          ctx.textAlign = 'center';
          ctx.fillText(node.label.slice(0, 12), node.x, node.y + r + 14);
        }
      });

      rafRef.current = requestAnimationFrame(draw);
    };

    draw();

    // ── Mouse hover ──────────────────────────────────────────────────────
    const onMove = (e) => {
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      let found = null;
      nodesRef.current.forEach((n, i) => {
        const dx = n.x - mx;
        const dy = n.y - my;
        if (Math.sqrt(dx * dx + dy * dy) <= n.r + 10) found = i;
      });
      hoveredRef.current = found;
      canvas.style.cursor = found !== null ? 'pointer' : 'default';
    };
    const onLeave = () => { hoveredRef.current = null; };

    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('mouseleave', onLeave);

    return () => {
      cancelAnimationFrame(rafRef.current);
      canvas.removeEventListener('mousemove', onMove);
      canvas.removeEventListener('mouseleave', onLeave);
    };
  }, [duplicates, animate]);

  return (
    <div
      className="network-graph-wrap"
      role="img"
      aria-label={`Network graph showing ${duplicates.length} related source(s)`}
    >
      <canvas ref={canvasRef} className="network-graph-canvas" />
    </div>
  );
}
