export type BrokerCategory = 'RITEL' | 'ASING' | 'INSTITUSI' | 'UNKNOWN';

export function getBrokerCategory(brokerCode: string): BrokerCategory {
    // Daftar referensi broker ritel (high frequency, dominan retail)
    const ritel = ['YP', 'PD', 'NI', 'CC', 'XC', 'SQ', 'EP', 'KK', 'CP', 'OD', 'SH', 'GR', 'BQ', 'DH', 'XL', 'BR'];
    
    // Daftar referensi broker asing (foreign dominan)
    const asing = ['BK', 'ZP', 'CS', 'RX', 'AK', 'KZ', 'YU', 'GW', 'CG', 'MS', 'BB', 'DX', 'ML'];
    
    // Daftar referensi broker institusi lokal
    const institusi = ['LG', 'DP', 'KI', 'DR', 'HP', 'IU', 'AZ', 'TP', 'IF'];

    const code = brokerCode.toUpperCase();
    if (asing.includes(code)) return 'ASING';
    if (ritel.includes(code)) return 'RITEL';
    if (institusi.includes(code)) return 'INSTITUSI';
    return 'UNKNOWN';
}

export function getCategoryBadgeStyle(category: BrokerCategory) {
    switch (category) {
        case 'ASING': return { color: '#E34C26', bg: 'rgba(227, 76, 38, 0.1)', border: 'rgba(227, 76, 38, 0.3)' }; // Orange-Red
        case 'RITEL': return { color: '#388BFD', bg: 'rgba(56, 139, 253, 0.1)', border: 'rgba(56, 139, 253, 0.3)' }; // Blue
        case 'INSTITUSI': return { color: '#3FB950', bg: 'rgba(63, 185, 80, 0.1)', border: 'rgba(63, 185, 80, 0.3)' }; // Green
        default: return { color: '#8B949E', bg: 'rgba(139, 148, 158, 0.1)', border: 'rgba(139, 148, 158, 0.3)' }; // Gray
    }
}
