import { useState, useEffect, type FocusEvent, type MouseEvent } from 'react';
import { Dashboard } from './components/Dashboard';
import { RawDataTab } from './components/RawDataTab';
import { BrokerFlowTab } from './components/BrokerFlowTab';
import { WatchlistTab } from './components/WatchlistTab';
import { SignalsTab } from './components/SignalsTab';
import { PriceVolumeTab } from './components/PriceVolumeTab';
import { RiskManagementTab } from './components/RiskManagementTab';
import { BrokerTrendTab } from './components/BrokerTrendTab';
import { AccumulationTab } from './components/AccumulationTab';
import { PhaseDetectorTab } from './components/PhaseDetectorTab';
import { CleaningTab } from './components/CleaningTab';
import { BrokerConsistencyTab } from './components/BrokerConsistencyTab';
import BrokerClustersTab from './components/BrokerClustersTab.tsx';
import { MarketContextTab } from './components/MarketContextTab';
import { RecommendationTab } from './components/RecommendationTab';
import { ValidationTab } from './components/ValidationTab';
import type { RawTradeData, ProcessedData } from './engine/types';
import { BandarmologiEngine } from './engine/BandarmologiEngine';
import { loadRawData } from './utils/storage';
import { clearStoredMarketContext, loadStoredMarketContext, saveStoredMarketContext } from './utils/marketContextStorage';
import type { MarketContext } from './engine/marketContext';
import { LayoutDashboard, Database, Activity, Target, Radio, BarChart2, ShieldCheck, LineChart, PackageSearch, Layers, Sparkles, Users, BookOpen, ClipboardCheck } from 'lucide-react';

type Tab = 'dashboard' | 'raw_data' | 'market_context' | 'watchlist' | 'broker_flow' | 'signals' | 'price_volume' | 'risk_management' | 'broker_trend' | 'accumulation' | 'phase_detector' | 'cleaning' | 'broker_consistency' | 'broker_clusters' | 'recommendation' | 'validation';

function App() {
  const [activeTab, setActiveTab] = useState<Tab>('raw_data');
  const [rawData, setRawData] = useState<RawTradeData[]>([]);
  const [processedData, setProcessedData] = useState<ProcessedData[]>([]);
  const [marketContext, setMarketContext] = useState<MarketContext | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function init() {
      const [storedData, storedMarketContext] = await Promise.all([
        loadRawData(),
        loadStoredMarketContext(),
      ]);
      setRawData(storedData);
      setMarketContext(storedMarketContext);

      if (storedData.length > 0) {
        const engine = new BandarmologiEngine(storedData);
        setProcessedData(engine.processAll());
        setActiveTab('dashboard'); // Default to dashboard if we have data
      }
      setIsLoading(false);
    }
    init();
  }, []);

  const handleDataUpdated = (newData: RawTradeData[]) => {
    setRawData(newData);
    if (newData.length > 0) {
      const engine = new BandarmologiEngine(newData);
      setProcessedData(engine.processAll());
    } else {
      setProcessedData([]);
    }
  };

  const handleMarketContextUpdated = async (nextContext: MarketContext | null) => {
    setMarketContext(nextContext);
    if (nextContext) {
      await saveStoredMarketContext(nextContext);
    } else {
      await clearStoredMarketContext();
    }
  };

  if (isLoading) {
    return <div style={{ color: 'white', padding: '40px', textAlign: 'center' }}>Loading Data...</div>;
  }

  return (
    <div className="app-container">
      {/* Sidebar */}
      <div className="sidebar">
        <h2 className="text-gradient mb-8" style={{ fontSize: '1.25rem', padding: '0 8px' }}>
          Bandarmologi
        </h2>

        <nav className="flex" style={{ flexDirection: 'column', gap: '4px' }}>
          <SidebarItem
            active={activeTab === 'dashboard'}
            icon={<LayoutDashboard size={18} />}
            label="Dashboard"
            onClick={() => setActiveTab('dashboard')}
          />
          <SidebarItem
            active={activeTab === 'raw_data'}
            icon={<Database size={18} />}
            label="Raw Data"
            onClick={() => setActiveTab('raw_data')}
          />
          <SidebarItem
            active={activeTab === 'market_context'}
            icon={<LineChart size={18} />}
            label="IHSG Context"
            onClick={() => setActiveTab('market_context')}
          />
          <SidebarItem
            active={activeTab === 'signals'}
            icon={<Radio size={18} />}
            label="Signals & Heatmap"
            onClick={() => setActiveTab('signals')}
            disabled={rawData.length === 0}
          />
          <SidebarItem
            active={activeTab === 'price_volume'}
            icon={<BarChart2 size={18} />}
            label="Price & Volume"
            onClick={() => setActiveTab('price_volume')}
            disabled={rawData.length === 0}
          />
          <SidebarItem
            active={activeTab === 'watchlist'}
            icon={<Target size={18} />}
            label="Watchlist"
            onClick={() => setActiveTab('watchlist')}
            disabled={rawData.length === 0}
          />
          <SidebarItem
            active={activeTab === 'broker_flow'}
            icon={<Activity size={18} />}
            label="Broker Flow"
            onClick={() => setActiveTab('broker_flow')}
            disabled={rawData.length === 0}
          />
          <SidebarItem
            active={activeTab === 'broker_trend'}
            icon={<LineChart size={18} />}
            label="Broker Trend"
            onClick={() => setActiveTab('broker_trend')}
            disabled={rawData.length === 0}
          />
          <SidebarItem
            active={activeTab === 'risk_management'}
            icon={<ShieldCheck size={18} />}
            label="Risk Management"
            onClick={() => setActiveTab('risk_management')}
          />

          <div style={{ borderTop: '1px solid var(--border-color)', margin: '8px 0' }} />

          <SidebarItem
            active={activeTab === 'accumulation'}
            icon={<PackageSearch size={18} />}
            label="Accum/Dist Tracker"
            onClick={() => setActiveTab('accumulation')}
            disabled={rawData.length === 0}
          />
          <SidebarItem
            active={activeTab === 'phase_detector'}
            icon={<Layers size={18} />}
            label="Wyckoff Phase"
            onClick={() => setActiveTab('phase_detector')}
            disabled={rawData.length === 0}
          />
          <SidebarItem
            active={activeTab === 'broker_consistency'}
            icon={<Users size={18} />}
            label="Broker Consistency"
            onClick={() => setActiveTab('broker_consistency')}
            disabled={rawData.length === 0}
          />
          <SidebarItem
            active={activeTab === 'broker_clusters'}
            icon={<Activity size={18} />}
            label="Broker Clusters"
            onClick={() => setActiveTab('broker_clusters')}
            disabled={rawData.length === 0}
          />
          <SidebarItem
            active={activeTab === 'cleaning'}
            icon={<Sparkles size={18} />}
            label="Data Cleaning"
            onClick={() => setActiveTab('cleaning')}
            disabled={rawData.length === 0}
          />

          <div style={{ borderTop: '1px solid var(--border-color)', margin: '8px 0' }} />

          <SidebarItem
            active={activeTab === 'recommendation'}
            icon={<BookOpen size={18} />}
            label="Rekomendasi Planning"
            onClick={() => setActiveTab('recommendation')}
            disabled={rawData.length === 0}
            highlight
          />
          <SidebarItem
            active={activeTab === 'validation'}
            icon={<ClipboardCheck size={18} />}
            label="Validasi Rekomendasi"
            onClick={() => setActiveTab('validation')}
            disabled={rawData.length === 0}
          />
        </nav>
      </div>

      {/* Main Content Area */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {activeTab === 'raw_data' && (
          <RawDataTab data={rawData} onDataUpdated={handleDataUpdated} />
        )}

        {activeTab === 'market_context' && (
          <MarketContextTab marketContext={marketContext} onMarketContextUpdated={handleMarketContextUpdated} />
        )}

        {activeTab === 'dashboard' && (
          <Dashboard data={processedData} />
        )}

        {activeTab === 'signals' && (
          <SignalsTab data={processedData} />
        )}

        {activeTab === 'price_volume' && (
          <PriceVolumeTab data={processedData} />
        )}

        {activeTab === 'watchlist' && (
          <WatchlistTab data={processedData} />
        )}

        {activeTab === 'broker_flow' && (
          <BrokerFlowTab data={processedData} />
        )}

        {activeTab === 'broker_trend' && (
          <BrokerTrendTab data={processedData} />
        )}

        {activeTab === 'risk_management' && (
          <RiskManagementTab />
        )}

        {activeTab === 'accumulation' && (
          <AccumulationTab data={processedData} />
        )}

        {activeTab === 'phase_detector' && (
          <PhaseDetectorTab data={processedData} />
        )}

        {activeTab === 'cleaning' && (
          <CleaningTab data={rawData} onDataUpdated={handleDataUpdated} />
        )}

        {activeTab === 'broker_consistency' && (
          <BrokerConsistencyTab data={processedData} />
        )}

        {activeTab === 'broker_clusters' && (
          <BrokerClustersTab data={processedData} />
        )}

        {activeTab === 'recommendation' && (
          <RecommendationTab data={processedData} marketContext={marketContext ?? undefined} />
        )}

        {activeTab === 'validation' && (
          <ValidationTab data={processedData} marketContext={marketContext ?? undefined} />
        )}
      </div>
    </div>
  );
}

function SidebarItem({ active, icon, label, onClick, disabled = false, highlight = false }: any) {
  const hasHighlight = highlight && !disabled;
  let backgroundColor = 'transparent';
  if (active) {
    backgroundColor = highlight ? 'rgba(9, 182, 162, 0.15)' : 'rgba(56, 139, 253, 0.1)';
  } else if (hasHighlight) {
    backgroundColor = 'rgba(9, 182, 162, 0.06)';
  }

  let textColor = 'var(--text-secondary)';
  if (active) {
    textColor = highlight ? 'var(--accent-teal)' : 'var(--accent-cyan)';
  } else if (hasHighlight) {
    textColor = 'var(--accent-teal)';
  }

  const fontWeight = active || highlight ? 600 : 500;

  const handleHoverIn = (event: MouseEvent<HTMLButtonElement> | FocusEvent<HTMLButtonElement>) => {
    if (!active && !disabled) {
      event.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
      event.currentTarget.style.color = 'var(--text-primary)';
    }
  };

  const handleHoverOut = (event: MouseEvent<HTMLButtonElement> | FocusEvent<HTMLButtonElement>) => {
    if (!active && !disabled) {
      event.currentTarget.style.background = 'transparent';
      event.currentTarget.style.color = 'var(--text-secondary)';
    }
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '12px 16px',
        borderRadius: '8px',
        background: backgroundColor,
        color: textColor,
        border: hasHighlight ? '1px solid rgba(9, 182, 162, 0.25)' : 'none',
        cursor: disabled ? 'not-allowed' : 'pointer',
        textAlign: 'left',
        fontFamily: 'inherit',
        fontSize: '0.875rem',
        fontWeight,
        transition: 'all 0.2s',
        opacity: disabled ? 0.5 : 1
      }}
      onMouseOver={handleHoverIn}
      onMouseOut={handleHoverOut}
      onFocus={handleHoverIn}
      onBlur={handleHoverOut}
    >
      {icon}
      {label}
    </button>
  );
}

export default App;
