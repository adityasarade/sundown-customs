import type { CSSProperties } from "react";
import { CHECKPOINTS } from "./driving";

export type MinimapProps = {
  x: number;
  z: number;
  heading: number;
  checkpoint: number;
};

const WIDTH = 145;
const HEIGHT = 150;
const PAD = 16;
const LEFT = -13;
const RIGHT = 153;
const TOP = -113;
const BOTTOM = 63;

const mapX = (x: number) =>
  PAD + ((x - LEFT) / (RIGHT - LEFT)) * (WIDTH - PAD * 2);
const mapY = (z: number) =>
  PAD + ((z - TOP) / (BOTTOM - TOP)) * (HEIGHT - PAD * 2);

const route = [
  `${mapX(0)},${mapY(50)}`,
  `${mapX(0)},${mapY(-100)}`,
  `${mapX(140)},${mapY(-100)}`,
  `${mapX(140)},${mapY(50)}`,
  `${mapX(0)},${mapY(50)}`,
].join(" L ");
const routePath = "M " + route;

const labelStyle: CSSProperties = {
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  letterSpacing: "0.11em",
};

export default function Minimap({ x, z, heading, checkpoint }: MinimapProps) {
  const completed = Math.max(0, Math.min(CHECKPOINTS.length, checkpoint));
  const carX = mapX(x);
  const carY = mapY(z);
  const next = CHECKPOINTS[completed];
  const finished = completed >= CHECKPOINTS.length;

  return (
    <svg
      width={WIDTH}
      height={HEIGHT}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      role="img"
      aria-label={`Solana Bay delivery loop. Checkpoint ${completed} of ${CHECKPOINTS.length}${finished ? ", route complete" : ""}.`}
      style={{
        display: "block",
        width: "145px",
        height: "150px",
        maxWidth: "100%",
        background: "rgba(6, 30, 40, .86)",
        border: "1px solid rgba(247, 203, 126, .45)",
        borderRadius: 10,
        boxShadow: "0 10px 30px rgba(0,0,0,.18)",
      }}
    >
      <defs>
        <linearGradient id="minimap-water" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#0c3e4b" />
          <stop offset="1" stopColor="#092a38" />
        </linearGradient>
        <filter
          id="minimap-glow"
          x="-100%"
          y="-100%"
          width="300%"
          height="300%"
        >
          <feGaussianBlur stdDeviation="2.2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <rect width={WIDTH} height={HEIGHT} rx="9" fill="url(#minimap-water)" />
      <path
        d={`M ${mapX(149)} ${mapY(-111)} L ${mapX(149)} ${mapY(61)}`}
        stroke="#247487"
        strokeWidth="1"
        strokeDasharray="2 4"
        opacity=".6"
      />
      <path
        d={routePath}
        fill="none"
        stroke="#0b202b"
        strokeWidth="10"
        strokeLinejoin="round"
        strokeLinecap="round"
        opacity=".85"
      />
      <path
        d={routePath}
        fill="none"
        stroke="#f2d39a"
        strokeWidth="4"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <path
        d={routePath}
        fill="none"
        stroke="#fff1c8"
        strokeWidth="1"
        strokeDasharray="3 4"
        strokeLinejoin="round"
        strokeLinecap="round"
        opacity=".9"
      />
      {CHECKPOINTS.map((point, index) => {
        const reached = index < completed;
        const active = index === completed && !finished;
        const fill = reached ? "#72d2aa" : active ? "#ffc76e" : "#173946";
        const stroke = reached ? "#b8f1cf" : active ? "#ffe2a6" : "#e7af78";
        return (
          <g
            key={point.name}
            transform={`translate(${mapX(point.x)} ${mapY(point.z)})`}
          >
            {active && (
              <circle
                r="7"
                fill="none"
                stroke="#ffc76e"
                strokeWidth="1"
                opacity=".8"
                filter="url(#minimap-glow)"
              />
            )}
            <circle r="5" fill={fill} stroke={stroke} strokeWidth="1.4" />
            <text
              x="0"
              y="2.5"
              textAnchor="middle"
              fill={reached || active ? "#062a32" : "#f8d7a6"}
              fontSize="6"
              fontWeight="800"
              style={labelStyle}
            >
              {index + 1}
            </text>
          </g>
        );
      })}
      <g
        transform={`translate(${carX} ${carY}) rotate(${(heading * 180) / Math.PI})`}
        filter="url(#minimap-glow)"
      >
        <path
          d="M 0 -7 L 4.2 5 L 0 3 L -4.2 5 Z"
          fill={finished ? "#72d2aa" : "#ff755f"}
          stroke="#fff1c8"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
      </g>
      <text
        x="10"
        y="12"
        fill="#ffdfaa"
        fontSize="7.3"
        fontWeight="700"
        style={labelStyle}
      >
        SOLANA BAY
      </text>
      <text x="10" y="22" fill="#7db7b6" fontSize="5.4" style={labelStyle}>
        DELIVERY LOOP
      </text>
      <text
        x={WIDTH - 10}
        y={HEIGHT - 9}
        textAnchor="end"
        fill="#8cc7bd"
        fontSize="5.5"
        style={labelStyle}
      >
        {finished ? "LOOP COMPLETE" : (next?.name ?? "FINISH")}
      </text>
    </svg>
  );
}
