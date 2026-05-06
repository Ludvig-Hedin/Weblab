interface Option {
    value: string;
    label: string;
}

interface Props {
    label: string;
    options: Option[];
    value: string;
    onChange: (value: string) => void;
}

export function SegmentedControl({ label, options, value, onChange }: Props) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span
                style={{
                    fontSize: 10,
                    color: '#666',
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    fontWeight: 600,
                }}
            >
                {label}
            </span>
            <div
                style={{
                    display: 'flex',
                    background: '#2a2a2a',
                    borderRadius: 6,
                    padding: 2,
                    gap: 2,
                }}
            >
                {options.map((opt) => {
                    const active = value === opt.value;
                    return (
                        <button
                            key={opt.value}
                            onClick={() => onChange(opt.value)}
                            style={{
                                padding: '4px 10px',
                                fontSize: 12,
                                border: 'none',
                                borderRadius: 4,
                                cursor: 'pointer',
                                background: active ? '#0057FF' : 'transparent',
                                color: active ? '#fff' : '#888',
                                fontWeight: active ? 600 : 400,
                            }}
                        >
                            {opt.label}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
