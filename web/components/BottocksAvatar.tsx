import { useId } from "react";
export interface AvatarOptions {
  color?: string;
  expression?: "happy" | "wink" | "sleepy";
  accessory?: "antenna" | "sprout" | "crown";
  name?: string;
}
export default function BottocksAvatar({
  color = "#74DFEE",
  expression = "happy",
  accessory = "antenna",
  name = "Original Bottocks robot",
}: AvatarOptions) {
  const id = useId().replace(/:/g, "");
  return (
    <svg
      className="b-avatar-svg"
      viewBox="0 0 320 310"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-labelledby={`${id}-title`}
    >
      <title id={`${id}-title`}>{name}</title>
      <ellipse
        cx="162"
        cy="284"
        rx="111"
        ry="12"
        fill="#242132"
        opacity=".13"
      />
      <g
        stroke="#242132"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path
          d="M112 250L100 282H138L145 250M180 250L188 282H224L213 250"
          fill="#FFFBEF"
        />
        <path
          d="M104 190Q61 187 60 228L76 238Q86 211 112 220M211 190Q255 191 257 227L241 236Q232 211 207 220"
          fill={color}
        />
        <rect x="97" y="176" width="127" height="83" rx="30" fill={color} />
        <path
          d="M157 203C134 183 109 206 118 225C130 246 157 231 160 222C165 240 191 243 202 225C214 204 184 186 163 203Z"
          fill="#FF5792"
        />
        <rect x="61" y="80" width="22" height="75" rx="10" fill="#FFFBEF" />
        <rect x="237" y="80" width="22" height="75" rx="10" fill="#FFFBEF" />
        <rect x="77" y="59" width="165" height="132" rx="40" fill={color} />
        <rect x="93" y="81" width="134" height="87" rx="26" fill="#242132" />
        {accessory === "antenna" && (
          <>
            <path d="M160 58V35" />
            <circle cx="160" cy="26" r="12" fill="#FF5792" />
          </>
        )}
        {accessory === "sprout" && (
          <>
            <path d="M160 58V29" />
            <path
              d="M160 37Q124 39 134 13Q160 11 160 37ZM160 33Q186 39 189 14Q165 9 160 33Z"
              fill="#F8FF45"
            />
          </>
        )}
        {accessory === "crown" && (
          <path
            d="M123 62L116 21L141 34L159 10L178 34L201 20L194 62Z"
            fill="#F8FF45"
          />
        )}
      </g>
      <g stroke={color} strokeWidth="8" strokeLinecap="round" fill="none">
        {expression === "happy" ? (
          <>
            <path d="M118 119V132M199 119V132M144 140Q161 155 177 140" />
          </>
        ) : expression === "wink" ? (
          <>
            <path d="M117 117L130 126L117 134M194 118V131M146 140Q164 153 180 138" />
          </>
        ) : (
          <>
            <path d="M113 127H132M188 127H207M153 145H170" />
          </>
        )}
      </g>
      <path
        d="M95 68Q127 61 138 66"
        stroke="white"
        strokeWidth="6"
        strokeLinecap="round"
        opacity=".8"
      />
      <path
        d="M48 102L36 98M265 156L278 160"
        stroke="#242132"
        strokeWidth="4"
        strokeLinecap="round"
      />
    </svg>
  );
}
