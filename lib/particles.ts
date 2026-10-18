// Pháo hoa lấp lánh khi bé tô trúng nét mẫu (FireworksView của app gốc).

type P = { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; size: number; star: boolean };

const COLORS = ["#ff5e7e", "#ffb02e", "#ffe14d", "#4cd97b", "#3fb8ff", "#a77bff", "#ff7bd5"];

export class Particles {
  private list: P[] = [];

  /** Toạ độ theo đơn vị thế giới. */
  burst(x: number, y: number, count = 14, speed = 3.2, spread = 1) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.4 + Math.random() * 0.8) * spread;
      const max = 28 + Math.random() * 22;
      this.list.push({
        x,
        y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v - 0.6,
        life: max,
        max,
        color: COLORS[(Math.random() * COLORS.length) | 0],
        size: 2 + Math.random() * 3.5,
        star: Math.random() < 0.45,
      });
    }
    if (this.list.length > 600) this.list.splice(0, this.list.length - 600);
  }

  /** Mưa pháo hoa khắp tờ giấy khi hoàn thành. */
  celebrate(w: number, h: number) {
    for (let k = 0; k < 7; k++) {
      setTimeout(() => this.burst(w * (0.15 + Math.random() * 0.7), h * (0.15 + Math.random() * 0.55), 34, 6), k * 180);
    }
  }

  get active() {
    return this.list.length > 0;
  }

  draw(g: CanvasRenderingContext2D) {
    if (!this.list.length) return;
    const next: P[] = [];
    for (const p of this.list) {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.12;
      p.vx *= 0.97;
      p.life -= 1;
      if (p.life <= 0) continue;
      next.push(p);
      g.globalAlpha = Math.min(1, (p.life / p.max) * 1.6);
      g.fillStyle = p.color;
      if (p.star) {
        drawStar(g, p.x, p.y, p.size * 1.4, p.life * 0.15);
      } else {
        g.beginPath();
        g.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        g.fill();
      }
    }
    g.globalAlpha = 1;
    this.list = next;
  }
}

function drawStar(g: CanvasRenderingContext2D, x: number, y: number, r: number, rot: number) {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = rot + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath();
  g.fill();
}
