/**
 * @file TelecomPage.tsx
 * Modular HAMBAKTECH Telecom & VTU Workspace:
 * Renders 10 dedicated single-service views with dual Light/Night theming,
 * authoritative wallet/tier/refund/points account strip, Transaction PIN authorization,
 * Nigerian MNP phone support, 4-step transactional flow, and customer portal footer.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import {
  AirtimePinDenomination,
  AirtimeSwapConfigItem,
  CablePackageItem,
  DataPinDenomination,
  ElectricityDiscoItem,
  ExamPackageItem,
  TelecomOrder,
  TelecomPlanItem,
} from '../../types';
import { TransactionPinModal } from './TransactionPinModal';
import {
  CustomerAccountSnapshot,
  TelecomTab,
} from './telecom/types';
import { CustomerPortalFooter } from './telecom/TelecomShared';
import { AirtimeServiceView } from './telecom/AirtimeServiceView';
import { DataServiceView } from './telecom/DataServiceView';
import { AirtimePinServiceView, DataPinServiceView } from './telecom/PinVendingViews';
import { AirtimeSwapView } from './telecom/AirtimeSwapView';
import {
  BulkSmsServiceView,
  CableTvServiceView,
  ElectricityServiceView,
  ExamCardsServiceView,
} from './telecom/UtilityBillsViews';
import { OrdersReceiptsView } from './telecom/OrdersReceiptsView';
import { AlertCircle, Clock } from 'lucide-react';

interface TelecomPageProps {
  initialService?: TelecomTab;
  onServiceChange?: (service: TelecomTab) => void;
  onDiscountLoaded?: (percent: number) => void;
  moduleStatus?: {
    status: string;
    name?: string;
    coming_soon_message?: string;
  };
}

export const TelecomPage: React.FC<TelecomPageProps> = ({
  initialService = 'airtime',
  onServiceChange,
  onDiscountLoaded,
  moduleStatus,
}) => {
  const { user, refreshUser, openPinSetupModal } = useAuth();
  const [activeService, setActiveService] = useState<TelecomTab>(initialService);

  // Catalogues
  const [airtimeDiscountPercent, setAirtimeDiscountPercent] = useState<number>(2.5);
  const [bulksmsUnitPrice, setBulksmsUnitPrice] = useState<number>(3.5);
  const [bulksmsSenderId, setBulksmsSenderId] = useState<string>('HAMBAKTECH');
  const [dataPlans, setDataPlans] = useState<TelecomPlanItem[]>([]);
  const [categoriesByNetwork, setCategoriesByNetwork] = useState<Record<string, string[]>>({});
  const [airtimePinDenoms, setAirtimePinDenoms] = useState<AirtimePinDenomination[]>([]);
  const [airtimePinStatus, setAirtimePinStatus] = useState<string>('');
  const [dataPinDenoms, setDataPinDenoms] = useState<DataPinDenomination[]>([]);
  const [dataPinAvailable, setDataPinAvailable] = useState<boolean>(false);
  const [dataPinStatus, setDataPinStatus] = useState<string>('');
  const [swapConfigs, setSwapConfigs] = useState<AirtimeSwapConfigItem[]>([]);
  const [cablePackages, setCablePackages] = useState<Record<string, CablePackageItem[]>>({});
  const [discos, setDiscos] = useState<ElectricityDiscoItem[]>([]);
  const [examPackages, setExamPackages] = useState<ExamPackageItem[]>([]);
  const [orders, setOrders] = useState<TelecomOrder[]>([]);

  // Authoritative account metrics
  const [pointsBalance, setPointsBalance] = useState<number | null>(null);
  const [totalRefunded, setTotalRefunded] = useState<number | null>(null);
  const [metricsLoaded, setMetricsLoaded] = useState<boolean>(false);

  // Global PIN Alert & Modal state
  const [pinWarning, setPinWarning] = useState<string | null>(null);
  const [isPinModalOpen, setIsPinModalOpen] = useState<boolean>(false);
  const [pendingPinAction, setPendingPinAction] = useState<((verifiedPin?: string) => Promise<void>) | null>(null);
  const [pinModalTitle, setPinModalTitle] = useState<string>('Authorize Purchase');
  const [pinModalDesc, setPinModalDesc] = useState<string>('');
  const [pinModalAmount, setPinModalAmount] = useState<number | undefined>(undefined);

  useEffect(() => {
    setActiveService(initialService);
  }, [initialService]);

  const handleSelectService = (srv: TelecomTab) => {
    setActiveService(srv);
    setPinWarning(null);
    if (onServiceChange) {
      onServiceChange(srv);
    }
  };

  const loadAccountMetrics = useCallback(async () => {
    try {
      const summary = await api.getCustomerSummary();
      const m = summary?.metrics;
      if (m) {
        if (typeof m.total_refunded === 'number') setTotalRefunded(m.total_refunded);
        if (typeof m.points_balance === 'number') setPointsBalance(m.points_balance);
      }
      if (typeof m?.points_balance !== 'number') {
        try {
          const refDash = await api.getReferralDashboard();
          if (typeof refDash?.balance?.points_balance === 'number') {
            setPointsBalance(refDash.balance.points_balance);
          }
        } catch {}
      }
      setMetricsLoaded(true);
    } catch {
      setMetricsLoaded(true);
    }
  }, []);

  const loadCatalogues = useCallback(async () => {
    await Promise.all([
      api
        .getTelecomPlans()
        .then((res) => {
          setDataPlans(res.plans || []);
          setCategoriesByNetwork(res.categories_by_network || {});
          if (typeof res.airtime_discount_percent === 'number') {
            setAirtimeDiscountPercent(res.airtime_discount_percent);
            if (onDiscountLoaded) onDiscountLoaded(res.airtime_discount_percent);
          }
          if (typeof res.bulksms_unit_price === 'number' && res.bulksms_unit_price > 0) {
            setBulksmsUnitPrice(res.bulksms_unit_price);
          }
          if (res.bulksms_sender_id) {
            setBulksmsSenderId(res.bulksms_sender_id);
          }
        })
        .catch(() => {}),
      api
        .getAirtimePinDenominations()
        .then((res) => {
          setAirtimePinDenoms(res.denominations || []);
          setAirtimePinStatus(res.catalogue_status || '');
        })
        .catch(() => {}),
      api
        .getDataPinDenominations()
        .then((res) => {
          setDataPinDenoms(res.denominations || []);
          setDataPinAvailable(Boolean(res.available_for_purchase));
          setDataPinStatus(res.catalogue_status || '');
        })
        .catch(() => {}),
      api
        .getAirtimeSwapConfig()
        .then((res) => setSwapConfigs(res.configs || []))
        .catch(() => {}),
      api
        .getCablePackages()
        .then((res) => setCablePackages(res.packages || {}))
        .catch(() => {}),
      api
        .getElectricityDiscos()
        .then((res) => setDiscos(res.discos || []))
        .catch(() => {}),
      api
        .getExamPackages()
        .then((res) => setExamPackages(res.packages || []))
        .catch(() => {}),
      api
        .getTelecomHistory()
        .then((res) => setOrders(res.orders || []))
        .catch(() => {}),
    ]);
  }, [onDiscountLoaded]);

  useEffect(() => {
    loadCatalogues();
    loadAccountMetrics();
  }, [loadCatalogues, loadAccountMetrics]);

  const handleTransactionComplete = useCallback(async () => {
    await Promise.all([
      refreshUser().catch(() => {}),
      loadAccountMetrics(),
      api
        .getTelecomHistory()
        .then((res) => setOrders(res.orders || []))
        .catch(() => {}),
    ]);
  }, [refreshUser, loadAccountMetrics]);

  const handleRefreshOrders = useCallback(async () => {
    const res = await api.getTelecomHistory();
    setOrders(res.orders || []);
  }, []);

  const handleAuthorizePin = (
    title: string,
    description: string,
    amount: number,
    action: (verifiedPin?: string) => Promise<void>
  ) => {
    setPinWarning(null);
    if (!user?.has_transaction_pin || user?.requires_pin_setup) {
      setPinWarning('Please activate your Transaction PIN before authorizing telecom purchases.');
      openPinSetupModal();
      return;
    }
    setPinModalTitle(title);
    setPinModalDesc(description);
    setPinModalAmount(amount);
    setPendingPinAction(() => action);
    setIsPinModalOpen(true);
  };

  const accountSnapshot: CustomerAccountSnapshot = {
    walletBalance: Number(user?.wallet_balance ?? 0),
    tier: Number(user?.tier ?? 1),
    pointsBalance,
    totalRefunded,
    loaded: metricsLoaded,
  };

  const customerName = user?.full_name || 'Valued Customer';
  const customerEmail = user?.email || '';

  if (moduleStatus && (moduleStatus.status === 'disabled' || moduleStatus.status === 'coming_soon')) {
    return (
      <div className="space-y-6">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 text-center space-y-3 shadow-xs">
          <div className="w-12 h-12 mx-auto rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 flex items-center justify-center text-amber-600 dark:text-amber-400">
            <Clock className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-extrabold text-slate-900 dark:text-white">
            {moduleStatus.name || 'Telecom & VTU Services'} — {moduleStatus.status === 'coming_soon' ? 'Temporarily Paused' : 'Currently Unavailable'}
          </h2>
          <p className="text-xs sm:text-sm text-slate-600 dark:text-slate-400 max-w-md mx-auto">
            {moduleStatus.coming_soon_message || 'This service module is currently undergoing administrative maintenance. Please check back shortly.'}
          </p>
        </div>
        <CustomerPortalFooter />
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {pinWarning && (
        <div className="no-print p-4 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 text-xs text-amber-900 dark:text-amber-200 flex items-center gap-2.5">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{pinWarning}</span>
        </div>
      )}

      {/* Single Active Service Viewport */}
      {activeService === 'airtime' && (
        <AirtimeServiceView
          account={accountSnapshot}
          customerName={customerName}
          customerEmail={customerEmail}
          discountPercent={airtimeDiscountPercent}
          onAuthorizePin={handleAuthorizePin}
          onTransactionComplete={handleTransactionComplete}
          onOpenHistory={() => handleSelectService('history')}
        />
      )}

      {activeService === 'data' && (
        <DataServiceView
          account={accountSnapshot}
          customerName={customerName}
          customerEmail={customerEmail}
          plans={dataPlans}
          categoriesByNetwork={categoriesByNetwork}
          onAuthorizePin={handleAuthorizePin}
          onTransactionComplete={handleTransactionComplete}
          onOpenHistory={() => handleSelectService('history')}
        />
      )}

      {activeService === 'airtime_pin' && (
        <AirtimePinServiceView
          account={accountSnapshot}
          customerName={customerName}
          customerEmail={customerEmail}
          denominations={airtimePinDenoms}
          catalogueStatus={airtimePinStatus}
          onAuthorizePin={handleAuthorizePin}
          onTransactionComplete={handleTransactionComplete}
          onOpenHistory={() => handleSelectService('history')}
        />
      )}

      {activeService === 'data_pin' && (
        <DataPinServiceView
          account={accountSnapshot}
          customerName={customerName}
          customerEmail={customerEmail}
          denominations={dataPinDenoms}
          available={dataPinAvailable}
          catalogueStatus={dataPinStatus}
          onAuthorizePin={handleAuthorizePin}
          onTransactionComplete={handleTransactionComplete}
          onOpenHistory={() => handleSelectService('history')}
        />
      )}

      {activeService === 'airtime_swap' && (
        <AirtimeSwapView
          account={accountSnapshot}
          customerName={customerName}
          customerEmail={customerEmail}
          configs={swapConfigs}
          onAuthorizePin={handleAuthorizePin}
          onTransactionComplete={handleTransactionComplete}
          onOpenHistory={() => handleSelectService('history')}
        />
      )}

      {activeService === 'cable' && (
        <CableTvServiceView
          account={accountSnapshot}
          customerName={customerName}
          customerEmail={customerEmail}
          packagesByProvider={cablePackages}
          onAuthorizePin={handleAuthorizePin}
          onTransactionComplete={handleTransactionComplete}
          onOpenHistory={() => handleSelectService('history')}
        />
      )}

      {activeService === 'electricity' && (
        <ElectricityServiceView
          account={accountSnapshot}
          customerName={customerName}
          customerEmail={customerEmail}
          discos={discos}
          onAuthorizePin={handleAuthorizePin}
          onTransactionComplete={handleTransactionComplete}
          onOpenHistory={() => handleSelectService('history')}
        />
      )}

      {activeService === 'exam' && (
        <ExamCardsServiceView
          account={accountSnapshot}
          customerName={customerName}
          customerEmail={customerEmail}
          packages={examPackages}
          onAuthorizePin={handleAuthorizePin}
          onTransactionComplete={handleTransactionComplete}
          onOpenHistory={() => handleSelectService('history')}
        />
      )}

      {activeService === 'bulksms' && (
        <BulkSmsServiceView
          account={accountSnapshot}
          customerName={customerName}
          customerEmail={customerEmail}
          unitPrice={bulksmsUnitPrice}
          defaultSenderId={bulksmsSenderId}
          onAuthorizePin={handleAuthorizePin}
          onTransactionComplete={handleTransactionComplete}
          onOpenHistory={() => handleSelectService('history')}
        />
      )}

      {activeService === 'history' && (
        <OrdersReceiptsView
          account={accountSnapshot}
          customerName={customerName}
          customerEmail={customerEmail}
          orders={orders}
          onRefreshOrders={handleRefreshOrders}
        />
      )}

      {/* Transaction PIN Modal */}
      <TransactionPinModal
        isOpen={isPinModalOpen}
        title={pinModalTitle}
        description={pinModalDesc}
        amount={pinModalAmount}
        onClose={() => {
          setIsPinModalOpen(false);
          setPendingPinAction(null);
        }}
        onSuccess={async (pin?: string) => {
          setIsPinModalOpen(false);
          if (pendingPinAction) {
            await pendingPinAction(pin);
          }
          setPendingPinAction(null);
        }}
      />

      <CustomerPortalFooter />
    </div>
  );
};
