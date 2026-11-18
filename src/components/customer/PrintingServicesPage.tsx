/**
 * @file PrintingServicesPage.tsx
 * Customer Dashboard — Printing & Document Services Module.
 * Supports:
 * - Submit Printing Request (6 configurable categories, dynamic fields, multi-file uploads, live estimate)
 * - My Printing Orders (15-status tracking, quotation approve/decline, deposit/full/delivery payments w/ PIN, messaging)
 * - Printing Price Guide (transparent customer-facing rates without internal costs)
 * - Delivery Information (Office Collection ₦0 + Lagos LGA/LCDA Delivery Zones)
 * - Printing Support (desk contacts + integrated support ticket)
 */

import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../../lib/api';
import { useAuth } from '../../context/AuthContext';
import {
  PrintingCategory,
  PrintingDeliveryZone,
  PrintingSettings,
  PrintingEstimate,
  PrintingOrder,
  PrintingOrderHistoryItem,
  PrintingOrderMessage,
  PrintingPaymentRecord,
  PrintingUploadedFile,
  PrintingOrderStatus,
} from '../../types';
import {
  Printer,
  FileText,
  Copy,
  Maximize2,
  CreditCard,
  Image as ImageIcon,
  Sparkles,
  Upload,
  Trash2,
  Eye,
  CheckCircle2,
  Clock,
  AlertCircle,
  Loader2,
  MapPin,
  Building2,
  Truck,
  Wallet,
  Send,
  MessageSquare,
  HelpCircle,
  RefreshCw,
  Tag,
  X,
  Phone,
  Mail,
  ShieldCheck,
  XCircle,
  ArrowRight,
  ChevronRight,
  Lock,
  ExternalLink,
  Download,
} from 'lucide-react';

type PrintingTab = 'submit' | 'orders' | 'rates' | 'delivery' | 'support';

interface PrintingServicesPageProps {
  initialOrderRef?: string;
  onNavigateToSecurity?: () => void;
}

const ALL_STATUSES: PrintingOrderStatus[] = [
  'Pending Review',
  'Under Review',
  'Awaiting Quotation',
  'Quotation Sent',
  'Awaiting Payment',
  'Payment Confirmed',
  'Processing',
  'On Hold',
  'Ready for Collection',
  'Ready for Dispatch',
  'Out for Delivery',
  'Completed',
  'Rejected',
  'Cancelled',
  'Refunded',
];

function getStatusBadgeClass(status: string): string {
  switch (status) {
    case 'Completed':
    case 'Payment Confirmed':
      return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30';
    case 'Quotation Sent':
    case 'Awaiting Payment':
      return 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30';
    case 'Processing':
    case 'Out for Delivery':
      return 'bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30';
    case 'Ready for Collection':
    case 'Ready for Dispatch':
      return 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border-indigo-500/30';
    case 'On Hold':
      return 'bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/30';
    case 'Rejected':
    case 'Cancelled':
      return 'bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30';
    case 'Refunded':
      return 'bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/30';
    default:
      return 'bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-500/30';
  }
}

function getCategoryIcon(iconName: string) {
  switch (iconName) {
    case 'Copy':
      return Copy;
    case 'Maximize2':
      return Maximize2;
    case 'CreditCard':
      return CreditCard;
    case 'Image':
      return ImageIcon;
    case 'Sparkles':
      return Sparkles;
    default:
      return FileText;
  }
}

export const PrintingServicesPage: React.FC<PrintingServicesPageProps> = ({
  initialOrderRef,
  onNavigateToSecurity,
}) => {
  const { user, refreshUser } = useAuth();
  const [activeTab, setActiveTab] = useState<PrintingTab>(initialOrderRef ? 'orders' : 'submit');

  // Catalog State
  const [categories, setCategories] = useState<PrintingCategory[]>([]);
  const [zones, setZones] = useState<PrintingDeliveryZone[]>([]);
  const [settings, setSettings] = useState<PrintingSettings | null>(null);
  const [bankDetails, setBankDetails] = useState<{ bank: string; accountNumber: string; accountName: string } | null>(null);
  const [catalogLoading, setCatalogLoading] = useState<boolean>(true);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [globalSuccess, setGlobalSuccess] = useState<string | null>(null);

  // Request Form State
  const [selectedCategoryKey, setSelectedCategoryKey] = useState<string>('doc_printing');
  const [customerName, setCustomerName] = useState<string>(user?.full_name || '');
  const [customerEmail, setCustomerEmail] = useState<string>(user?.email || '');
  const [customerPhone, setCustomerPhone] = useState<string>(user?.phone_number || '');
  const [serviceTitle, setServiceTitle] = useState<string>('');
  const [quantity, setQuantity] = useState<number>(1);
  const [pageCount, setPageCount] = useState<number>(1);
  const [widthFt, setWidthFt] = useState<number>(4);
  const [heightFt, setHeightFt] = useState<number>(3);
  const [colorMode, setColorMode] = useState<'bw' | 'color' | 'mixed' | 'full_color'>('color');
  const [paperSize, setPaperSize] = useState<string>('');
  const [finishingCodes, setFinishingCodes] = useState<string[]>([]);
  const [isUrgent, setIsUrgent] = useState<boolean>(false);
  const [specialInstructions, setSpecialInstructions] = useState<string>('');
  const [dynamicFields, setDynamicFields] = useState<Record<string, string>>({});
  const [uploadedFiles, setUploadedFiles] = useState<PrintingUploadedFile[]>([]);
  const [uploadingFile, setUploadingFile] = useState<boolean>(false);

  // Collection & Delivery State
  const [collectionMethod, setCollectionMethod] = useState<'office_collection' | 'paid_delivery'>('office_collection');
  const [deliveryZoneId, setDeliveryZoneId] = useState<string>('');
  const [recipientName, setRecipientName] = useState<string>(user?.full_name || '');
  const [recipientPhone, setRecipientPhone] = useState<string>(user?.phone_number || '');
  const [deliveryDestination, setDeliveryDestination] = useState<string>('');
  const [deliveryLga, setDeliveryLga] = useState<string>(user?.lga || '');
  const [deliveryTown, setDeliveryTown] = useState<string>('');
  const [deliveryAddress, setDeliveryAddress] = useState<string>(user?.residential_address || user?.address || '');
  const [deliveryLandmark, setDeliveryLandmark] = useState<string>('');

  // Live Estimate
  const [estimate, setEstimate] = useState<PrintingEstimate | null>(null);
  const [estimateLoading, setEstimateLoading] = useState<boolean>(false);
  const [estimateError, setEstimateError] = useState<string | null>(null);
  const [submittingOrder, setSubmittingOrder] = useState<boolean>(false);

  // Orders & Detail Modal State
  const [orders, setOrders] = useState<PrintingOrder[]>([]);
  const [ordersLoading, setOrdersLoading] = useState<boolean>(false);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedOrder, setSelectedOrder] = useState<PrintingOrder | null>(null);
  const [orderHistory, setOrderHistory] = useState<PrintingOrderHistoryItem[]>([]);
  const [orderMessages, setOrderMessages] = useState<PrintingOrderMessage[]>([]);
  const [orderPayments, setOrderPayments] = useState<PrintingPaymentRecord[]>([]);
  const [detailLoading, setDetailLoading] = useState<boolean>(false);

  // Order Action States
  const [quoteDeclineReason, setQuoteDeclineReason] = useState<string>('');
  const [showDeclineBox, setShowDeclineBox] = useState<boolean>(false);
  const [actionBusy, setActionBusy] = useState<boolean>(false);
  const [payScope, setPayScope] = useState<'full' | 'deposit' | 'balance' | 'delivery'>('full');
  const [payGateway, setPayGateway] = useState<'wallet' | 'manual_transfer' | 'paystack' | 'flutterwave'>('wallet');
  const [txPin, setTxPin] = useState<string>('');
  const [payerName, setPayerName] = useState<string>(user?.full_name || '');
  const [bankReference, setBankReference] = useState<string>('');
  const [proofUrl, setProofUrl] = useState<string>('');
  const [payRemarks, setPayRemarks] = useState<string>('');
  const [pendingVerifyRef, setPendingVerifyRef] = useState<string | null>(null);
  const [pendingCheckoutUrl, setPendingCheckoutUrl] = useState<string | null>(null);
  const [chatMessage, setChatMessage] = useState<string>('');

  // Support Tab State
  const [supportSubject, setSupportSubject] = useState<string>('');
  const [supportOrderRef, setSupportOrderRef] = useState<string>('');
  const [supportMessage, setSupportMessage] = useState<string>('');
  const [supportBusy, setSupportBusy] = useState<boolean>(false);
  const [previewFile, setPreviewFile] = useState<{ url: string; name: string; mimeType: string } | null>(null);

  const selectedCategory = categories.find(c => c.category_key === selectedCategoryKey) || categories[0] || null;

  const loadCatalog = useCallback(async () => {
    try {
      setCatalogLoading(true);
      const res = await api.getPrintingCatalog();
      if (res.success) {
        setCategories(res.categories || []);
        setZones(res.delivery_zones || []);
        setSettings(res.settings || null);
        setBankDetails(res.bank_details || null);
        if (res.categories?.length > 0) {
          const def = res.categories.find(c => c.category_key === selectedCategoryKey) || res.categories[0];
          setSelectedCategoryKey(def.category_key);
          setQuantity(Math.max(1, def.min_quantity || 1));
          setPaperSize(def.paper_sizes?.[0] || '');
        }
        if (res.delivery_zones?.length > 0 && !deliveryZoneId) {
          const firstZone = res.delivery_zones[0];
          setDeliveryZoneId(firstZone.id);
          setDeliveryDestination(firstZone.destination_group);
          setDeliveryLga(firstZone.lga_lcda);
        }
      }
    } catch (err: any) {
      setGlobalError(err.message || 'Failed to load printing catalog.');
    } finally {
      setCatalogLoading(false);
    }
  }, []);

  const loadOrders = useCallback(async (filterStatus: string = statusFilter) => {
    try {
      setOrdersLoading(true);
      const res = await api.getPrintingOrders(filterStatus);
      if (res.success) {
        setOrders(res.orders || []);
      }
    } catch (err: any) {
      setGlobalError(err.message || 'Failed to load your printing orders.');
    } finally {
      setOrdersLoading(false);
    }
  }, [statusFilter]);

  const openOrderDetail = useCallback(async (idOrRef: string) => {
    try {
      setDetailLoading(true);
      setShowDeclineBox(false);
      setPendingVerifyRef(null);
      setPendingCheckoutUrl(null);
      const res = await api.getPrintingOrderDetail(idOrRef);
      if (res.success) {
        setSelectedOrder(res.order);
        setOrderHistory(res.history || []);
        setOrderMessages(res.messages || []);
        setOrderPayments(res.payments || []);
        if (res.order.deposit_enabled && res.order.amount_paid === 0) {
          setPayScope('deposit');
        } else if (res.order.amount_paid > 0) {
          setPayScope('balance');
        } else {
          setPayScope('full');
        }
      }
    } catch (err: any) {
      setGlobalError(err.message || 'Failed to load printing order details.');
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCatalog();
    loadOrders('all');
  }, [loadCatalog, loadOrders]);

  useEffect(() => {
    if (initialOrderRef) {
      setActiveTab('orders');
      openOrderDetail(initialOrderRef).then(() => {
        if (typeof window !== 'undefined') {
          const hashStr = window.location.hash || '';
          const qIdx = hashStr.indexOf('?');
          const hashParams = qIdx !== -1 ? new URLSearchParams(hashStr.slice(qIdx + 1)) : new URLSearchParams('');
          const searchParams = new URLSearchParams(window.location.search || '');
          const retRef =
            hashParams.get('reference') ||
            hashParams.get('trxref') ||
            hashParams.get('tx_ref') ||
            searchParams.get('reference') ||
            searchParams.get('trxref') ||
            searchParams.get('tx_ref');
          const txId = hashParams.get('transaction_id') || searchParams.get('transaction_id') || undefined;
          if (retRef) {
            setPendingVerifyRef(retRef);
            api.verifyPrintingPayment(initialOrderRef, retRef, txId)
              .then(res => {
                if (res.success) {
                  setPendingVerifyRef(null);
                  setPendingCheckoutUrl(null);
                  setGlobalSuccess(res.message || 'Printing payment confirmed!');
                  void refreshUser();
                  void loadOrders(statusFilter);
                  void openOrderDetail(initialOrderRef);
                }
              })
              .catch(() => {
                // Keep manual verify button visible if awaiting confirmation
              });
          }
        }
      });
    }
  }, [initialOrderRef, openOrderDetail]);

  // Reset category-specific defaults when switching category
  const handleSelectCategory = (cat: PrintingCategory) => {
    setSelectedCategoryKey(cat.category_key);
    setQuantity(Math.max(1, cat.min_quantity || 1));
    setPaperSize(cat.paper_sizes?.[0] || '');
    setFinishingCodes([]);
    const defaults: Record<string, string> = {};
    (cat.field_schema || []).forEach(f => {
      if (f.key === 'page_count') setPageCount(Number(f.default || 1));
      else if (f.key === 'width_ft') setWidthFt(Number(f.default || 4));
      else if (f.key === 'height_ft') setHeightFt(Number(f.default || 3));
      else if (f.options && f.options.length > 0) defaults[f.key] = String(f.default ?? f.options[0]);
      else defaults[f.key] = String(f.default ?? '');
    });
    setDynamicFields(defaults);
  };

  // Live Estimate Effect
  useEffect(() => {
    if (!selectedCategory) return;
    const timer = setTimeout(async () => {
      try {
        setEstimateLoading(true);
        setEstimateError(null);
        const res = await api.estimatePrintingOrder({
          category_key: selectedCategory.category_key,
          quantity: Math.max(1, quantity),
          page_count: Math.max(1, pageCount),
          color_mode: colorMode,
          paper_size: paperSize,
          width_ft: widthFt,
          height_ft: heightFt,
          finishing_requirements: finishingCodes,
          is_urgent: isUrgent,
          collection_method: collectionMethod,
          delivery_zone_id: collectionMethod === 'paid_delivery' ? deliveryZoneId : undefined,
        });
        if (res.success) {
          setEstimate(res);
        }
      } catch (err: any) {
        setEstimateError(err.message || 'Unable to compute estimate.');
      } finally {
        setEstimateLoading(false);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [
    selectedCategory,
    quantity,
    pageCount,
    colorMode,
    paperSize,
    widthFt,
    heightFt,
    finishingCodes,
    isUrgent,
    collectionMethod,
    deliveryZoneId,
  ]);

  const handleZoneChange = (zId: string) => {
    setDeliveryZoneId(zId);
    const z = zones.find(item => item.id === zId);
    if (z) {
      setDeliveryDestination(z.destination_group);
      setDeliveryLga(z.lga_lcda);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploadingFile(true);
    setGlobalError(null);
    try {
      for (const file of Array.from(files)) {
        const res = await api.uploadPrintingFile(file);
        if (res.success) {
          setUploadedFiles(prev => [
            ...prev,
            {
              id: res.id,
              file_name: res.file_name,
              file_url: res.file_url,
              mime_type: res.mime_type,
              file_size: res.file_size,
            },
          ]);
        }
      }
    } catch (err: any) {
      setGlobalError(err.message || 'File upload failed.');
    } finally {
      setUploadingFile(false);
      e.target.value = '';
    }
  };

  const closePreviewModal = () => {
    if (previewFile?.url) {
      URL.revokeObjectURL(previewFile.url);
    }
    setPreviewFile(null);
  };

  const handlePreviewFile = async (fileUrl: string, fileName?: string) => {
    try {
      const { blobUrl, mimeType } = await api.fetchPrintingFileBlobUrl(fileUrl);
      if (previewFile?.url) {
        URL.revokeObjectURL(previewFile.url);
      }
      setPreviewFile({
        url: blobUrl,
        name: fileName || 'Uploaded Artwork / Document',
        mimeType: mimeType || 'application/octet-stream',
      });
    } catch (err: any) {
      setGlobalError(err.message || 'Unable to open file.');
    }
  };

  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCategory) return;
    setGlobalError(null);
    setGlobalSuccess(null);

    if (collectionMethod === 'paid_delivery') {
      if (!recipientName.trim() || !recipientPhone.trim() || !deliveryLga.trim() || !deliveryTown.trim() || !deliveryAddress.trim() || !deliveryLandmark.trim()) {
        setGlobalError('Please fill in all required Paid Delivery fields: recipient name, phone, Lagos LGA/LCDA, town, full street address, and nearby landmark.');
        return;
      }
    }

    setSubmittingOrder(true);
    try {
      const res = await api.createPrintingOrder({
        category_key: selectedCategory.category_key,
        customer_name: customerName,
        customer_email: customerEmail,
        customer_phone: customerPhone,
        service_title: serviceTitle.trim() || undefined,
        quantity,
        page_count: pageCount,
        width_ft: widthFt,
        height_ft: heightFt,
        color_mode: colorMode,
        paper_size: paperSize,
        finishing_requirements: finishingCodes,
        is_urgent: isUrgent,
        special_instructions: specialInstructions,
        uploaded_files: uploadedFiles,
        collection_method: collectionMethod,
        delivery_zone_id: collectionMethod === 'paid_delivery' ? deliveryZoneId : undefined,
        delivery_recipient_name: recipientName,
        delivery_recipient_phone: recipientPhone,
        delivery_destination: deliveryDestination,
        delivery_lga_lcda: deliveryLga,
        delivery_town: deliveryTown,
        delivery_address: deliveryAddress,
        delivery_landmark: deliveryLandmark,
        ...dynamicFields,
        specs: {
          ...dynamicFields,
          page_count: pageCount,
        },
      });

      if (res.success && res.order) {
        setGlobalSuccess(`Printing request ${res.order.order_reference} submitted! Our desk will review your specs and send your official quotation.`);
        setServiceTitle('');
        setSpecialInstructions('');
        setUploadedFiles([]);
        await loadOrders(statusFilter);
        setActiveTab('orders');
        await openOrderDetail(res.order.id);
      }
    } catch (err: any) {
      setGlobalError(err.message || 'Failed to submit printing request.');
    } finally {
      setSubmittingOrder(false);
    }
  };

  const handleQuoteDecision = async (decision: 'approve' | 'decline') => {
    if (!selectedOrder) return;
    setActionBusy(true);
    setGlobalError(null);
    try {
      const res = await api.respondPrintingQuote(
        selectedOrder.id,
        decision,
        decision === 'decline' ? quoteDeclineReason : undefined
      );
      if (res.success) {
        setGlobalSuccess(res.message);
        setShowDeclineBox(false);
        setQuoteDeclineReason('');
        await loadOrders(statusFilter);
        await openOrderDetail(selectedOrder.id);
      }
    } catch (err: any) {
      setGlobalError(err.message || 'Could not process quotation decision.');
    } finally {
      setActionBusy(false);
    }
  };

  const handlePayOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrder) return;
    setActionBusy(true);
    setGlobalError(null);
    try {
      const res = await api.payPrintingOrder(selectedOrder.id, {
        gateway: payGateway,
        payment_scope: payScope,
        transaction_pin: payGateway === 'wallet' ? txPin : undefined,
        payer_name: payGateway === 'manual_transfer' ? payerName : undefined,
        bank_reference: payGateway === 'manual_transfer' ? bankReference : undefined,
        proof_url: payGateway === 'manual_transfer' ? proofUrl : undefined,
        remarks: payGateway === 'manual_transfer' ? payRemarks : undefined,
        callback_url: typeof window !== 'undefined' ? `${window.location.origin}/#printing` : undefined,
      });
      if (res.success) {
        setTxPin('');
        if (payGateway === 'paystack' || payGateway === 'flutterwave') {
          const checkoutLink = res.authorization_url || res.link || null;
          setPendingVerifyRef(res.reference || null);
          setPendingCheckoutUrl(checkoutLink);
          setGlobalSuccess(`Checkout initialized (Ref: ${res.reference}). Use the checkout button or confirm verification below.`);
          await refreshUser();
          await loadOrders(statusFilter);
          return;
        } else {
          setGlobalSuccess(res.message);
        }
        await refreshUser();
        await loadOrders(statusFilter);
        await openOrderDetail(selectedOrder.id);
      }
    } catch (err: any) {
      setGlobalError(err.message || 'Payment failed.');
    } finally {
      setActionBusy(false);
    }
  };

  const handleVerifyGatewayPayment = async () => {
    if (!selectedOrder || !pendingVerifyRef) return;
    setActionBusy(true);
    setGlobalError(null);
    try {
      const res = await api.verifyPrintingPayment(selectedOrder.id, pendingVerifyRef);
      if (res.success) {
        setPendingVerifyRef(null);
        setPendingCheckoutUrl(null);
        setGlobalSuccess(res.message);
        await loadOrders(statusFilter);
        await openOrderDetail(selectedOrder.id);
      }
    } catch (err: any) {
      setGlobalError(err.message || 'Payment verification failed.');
    } finally {
      setActionBusy(false);
    }
  };

  const handleCancelOrder = async () => {
    if (!selectedOrder) return;
    setActionBusy(true);
    setGlobalError(null);
    try {
      const res = await api.cancelPrintingOrder(selectedOrder.id, 'Cancelled by customer from portal');
      if (res.success) {
        setGlobalSuccess(res.message);
        await loadOrders(statusFilter);
        await openOrderDetail(selectedOrder.id);
      }
    } catch (err: any) {
      setGlobalError(err.message || 'Unable to cancel order.');
    } finally {
      setActionBusy(false);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrder || !chatMessage.trim()) return;
    setActionBusy(true);
    try {
      await api.sendPrintingMessage(selectedOrder.id, chatMessage.trim());
      setChatMessage('');
      await openOrderDetail(selectedOrder.id);
    } catch (err: any) {
      setGlobalError(err.message || 'Failed to send message.');
    } finally {
      setActionBusy(false);
    }
  };

  const handleSubmitSupportTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supportSubject.trim() || !supportMessage.trim()) return;
    setSupportBusy(true);
    setGlobalError(null);
    try {
      const fullSubject = `[Printing Support] ${supportOrderRef ? `(${supportOrderRef}) ` : ''}${supportSubject.trim()}`;
      await api.submitSupportTicket({
        subject: fullSubject,
        message: supportMessage.trim(),
        priority: 'normal',
      });
      setSupportSubject('');
      setSupportOrderRef('');
      setSupportMessage('');
      setGlobalSuccess('Your Printing Support ticket has been sent to our desk. We will respond shortly.');
    } catch (err: any) {
      setGlobalError(err.message || 'Failed to submit support ticket.');
    } finally {
      setSupportBusy(false);
    }
  };

  const toggleFinishing = (code: string) => {
    setFinishingCodes(prev => (prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]));
  };

  if (catalogLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-500 dark:text-slate-400">
        <Loader2 className="w-7 h-7 animate-spin text-blue-600" />
        <p className="text-xs font-medium">Loading Printing &amp; Document Services...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Hero Banner */}
      <div className="rounded-2xl bg-gradient-to-br from-blue-900 via-slate-900 to-slate-950 border border-blue-800/40 p-6 text-white shadow-lg">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-lg bg-blue-500/20 border border-blue-400/30 text-[11px] font-semibold text-blue-200">
              <Printer className="w-3.5 h-3.5" />
              <span>Printing &amp; Document Services</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight">
              Commercial, Academic, Large-Format &amp; ID Printing Desk
            </h1>
            <p className="text-xs text-slate-300 max-w-2xl leading-relaxed">
              Upload your documents or artwork, receive a manually verified official quotation, approve and pay securely via Wallet, Card, or Bank Transfer, and choose free Office Collection or tracked Lagos Delivery.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setActiveTab('submit')}
              className="px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold flex items-center gap-1.5 transition"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>New Print Request</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('orders');
                loadOrders(statusFilter);
              }}
              className="px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-semibold flex items-center gap-1.5 border border-white/15 transition"
            >
              <Clock className="w-3.5 h-3.5" />
              <span>My Orders ({orders.length})</span>
            </button>
          </div>
        </div>
      </div>

      {/* Sub-Navigation Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
        {(
          [
            { id: 'submit', label: 'Submit Printing Request', icon: Printer },
            { id: 'orders', label: 'My Printing Orders', icon: FileText, count: orders.length },
            { id: 'rates', label: 'Printing Price Guide', icon: Tag },
            { id: 'delivery', label: 'Delivery Information', icon: Truck },
            { id: 'support', label: 'Printing Support', icon: HelpCircle },
          ] as Array<{ id: PrintingTab; label: string; icon: React.FC<{ className?: string }>; count?: number }>
        ).map(tab => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setActiveTab(tab.id);
                if (tab.id === 'orders') {
                  loadOrders(statusFilter);
                }
              }}
              className={`px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 transition ${
                active
                  ? 'bg-blue-700 text-white shadow-sm'
                  : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
              {tab.count !== undefined && (
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${active ? 'bg-blue-800 text-blue-100' : 'bg-slate-100 dark:bg-slate-800'}`}>
                  {tab.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Feedback Alerts */}
      {globalError && (
        <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-300 text-xs flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{globalError}</span>
          </div>
          <button type="button" onClick={() => setGlobalError(null)} className="p-1 hover:opacity-75">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
      {globalSuccess && (
        <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-xs flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{globalSuccess}</span>
          </div>
          <button type="button" onClick={() => setGlobalSuccess(null)} className="p-1 hover:opacity-75">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* =================================================================== */}
      {/* TAB 1: SUBMIT PRINTING REQUEST                                      */}
      {/* =================================================================== */}
      {activeTab === 'submit' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Form Column */}
          <form onSubmit={handleSubmitOrder} className="lg:col-span-8 space-y-6">
            {/* Step 1: Select Service Category */}
            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-4 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                    1. Select Printing Service Category
                  </h2>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Choose the exact service type or request a custom manual quotation.
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {categories.map(cat => {
                  const Icon = getCategoryIcon(cat.icon);
                  const active = cat.category_key === selectedCategoryKey;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => handleSelectCategory(cat)}
                      className={`p-3.5 rounded-xl border text-left transition flex flex-col justify-between gap-2 ${
                        active
                          ? 'bg-blue-50 dark:bg-blue-950/40 border-blue-600 ring-1 ring-blue-600'
                          : 'bg-slate-50 dark:bg-slate-950/60 border-slate-200 dark:border-slate-800 hover:border-blue-400'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${active ? 'bg-blue-600 text-white' : 'bg-blue-500/10 text-blue-600 dark:text-blue-400'}`}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-200/70 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                          {cat.measurement_method === 'manual' ? 'Quote' : `₦${Number(cat.color_rate || cat.base_rate).toLocaleString()}/${cat.unit_label}`}
                        </span>
                      </div>
                      <div>
                        <div className="text-xs font-bold text-slate-900 dark:text-white">{cat.name}</div>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 line-clamp-2 mt-0.5">
                          {cat.description}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Step 2: Customer Contact & Job Title */}
            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-4 shadow-sm">
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                2. Customer Contact &amp; Job Reference
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">Full Name *</label>
                  <input
                    type="text"
                    required
                    value={customerName}
                    onChange={e => setCustomerName(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">Email *</label>
                  <input
                    type="email"
                    required
                    value={customerEmail}
                    onChange={e => setCustomerEmail(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">Phone Number *</label>
                  <input
                    type="tel"
                    required
                    value={customerPhone}
                    onChange={e => setCustomerPhone(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Job Title / Short Description (Optional)
                </label>
                <input
                  type="text"
                  placeholder={`e.g. ${selectedCategory?.name || 'Exam Papers'} — First Term Batch`}
                  value={serviceTitle}
                  onChange={e => setServiceTitle(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white"
                />
              </div>
            </div>

            {/* Step 3: Specifications & Dynamic Category Fields */}
            {selectedCategory && (
              <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-4 shadow-sm">
                <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                  3. Specifications for {selectedCategory.name}
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                      Quantity (Min: {selectedCategory.min_quantity}) *
                    </label>
                    <input
                      type="number"
                      min={selectedCategory.min_quantity}
                      required
                      value={quantity}
                      onChange={e => setQuantity(Math.max(1, Number(e.target.value || 1)))}
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white font-mono"
                    />
                  </div>

                  {selectedCategory.paper_sizes?.length > 0 && (
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                        Paper Size / Material
                      </label>
                      <select
                        value={paperSize}
                        onChange={e => setPaperSize(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white"
                      >
                        {selectedCategory.paper_sizes.map(sz => (
                          <option key={sz} value={sz}>
                            {sz}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                      Colour Preference
                    </label>
                    <select
                      value={colorMode}
                      onChange={e => setColorMode(e.target.value as any)}
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white"
                    >
                      <option value="bw">Black &amp; White</option>
                      <option value="color">Full Colour</option>
                      <option value="mixed">Mixed (Cover Colour + Inner B&amp;W)</option>
                    </select>
                  </div>

                  {/* Dynamic fields from category field_schema */}
                  {(selectedCategory.field_schema || []).map(field => {
                    if (field.key === 'page_count') {
                      return (
                        <div key={field.key}>
                          <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                            {field.label} {field.required ? '*' : ''}
                          </label>
                          <input
                            type="number"
                            min={1}
                            required={field.required}
                            value={pageCount}
                            onChange={e => setPageCount(Math.max(1, Number(e.target.value || 1)))}
                            className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white font-mono"
                          />
                        </div>
                      );
                    }
                    if (field.key === 'width_ft') {
                      return (
                        <div key={field.key}>
                          <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                            {field.label} *
                          </label>
                          <input
                            type="number"
                            step="0.1"
                            min={0.5}
                            required
                            value={widthFt}
                            onChange={e => setWidthFt(Math.max(0.5, Number(e.target.value || 1)))}
                            className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white font-mono"
                          />
                        </div>
                      );
                    }
                    if (field.key === 'height_ft') {
                      return (
                        <div key={field.key}>
                          <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                            {field.label} *
                          </label>
                          <input
                            type="number"
                            step="0.1"
                            min={0.5}
                            required
                            value={heightFt}
                            onChange={e => setHeightFt(Math.max(0.5, Number(e.target.value || 1)))}
                            className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white font-mono"
                          />
                        </div>
                      );
                    }
                    if (field.type === 'select' && field.options) {
                      return (
                        <div key={field.key}>
                          <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                            {field.label} {field.required ? '*' : ''}
                          </label>
                          <select
                            required={field.required}
                            value={dynamicFields[field.key] ?? field.options[0] ?? ''}
                            onChange={e => setDynamicFields(prev => ({ ...prev, [field.key]: e.target.value }))}
                            className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white"
                          >
                            {field.options.map(opt => (
                              <option key={opt} value={opt}>
                                {opt}
                              </option>
                            ))}
                          </select>
                        </div>
                      );
                    }
                    return (
                      <div key={field.key}>
                        <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                          {field.label} {field.required ? '*' : ''}
                        </label>
                        <input
                          type={field.type === 'number' ? 'number' : 'text'}
                          required={field.required}
                          value={dynamicFields[field.key] ?? ''}
                          onChange={e => setDynamicFields(prev => ({ ...prev, [field.key]: e.target.value }))}
                          className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white"
                        />
                      </div>
                    );
                  })}
                </div>

                {/* Finishing Options */}
                {selectedCategory.finishing_options?.length > 0 && (
                  <div className="pt-2 space-y-2">
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                      Finishing &amp; Binding Requirements
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {selectedCategory.finishing_options.map(opt => {
                        const checked = finishingCodes.includes(opt.code);
                        return (
                          <label
                            key={opt.code}
                            className={`flex items-center justify-between px-3 py-2 rounded-xl border text-xs cursor-pointer transition ${
                              checked
                                ? 'bg-blue-50 dark:bg-blue-950/30 border-blue-500 text-slate-900 dark:text-white'
                                : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleFinishing(opt.code)}
                                className="rounded border-slate-300 text-blue-600"
                              />
                              <span>{opt.label}</span>
                            </div>
                            <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400">
                              {opt.fee > 0 ? `+₦${Number(opt.fee).toLocaleString()}` : 'Included'}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Urgent Priority & Special Instructions */}
                <div className="pt-2 space-y-3">
                  <label className="flex items-center justify-between p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 cursor-pointer">
                    <div>
                      <span className="text-xs font-bold text-amber-800 dark:text-amber-300">
                        Express / Urgent Priority Job
                      </span>
                      <p className="text-[10px] text-amber-700/80 dark:text-amber-400/80">
                        Priority press allocation ({selectedCategory.urgent_fee_type === 'flat' ? `+₦${Number(selectedCategory.urgent_fee_value).toLocaleString()} flat` : `+${selectedCategory.urgent_fee_value}%`}).
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={isUrgent}
                      onChange={e => setIsUrgent(e.target.checked)}
                      className="w-4 h-4 rounded text-amber-600"
                    />
                  </label>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                      Additional Instructions / Notes for Printing Desk
                    </label>
                    <textarea
                      rows={3}
                      placeholder="Specify binding sides, bleed margins, ID card employee names list notes, banner grommet spacing, etc."
                      value={specialInstructions}
                      onChange={e => setSpecialInstructions(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Step 4: Document & Design Uploads */}
            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-3 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                    4. Upload Documents / Design Artwork
                  </h2>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Accepted: {(settings?.allowed_file_types || ['PDF', 'DOCX', 'JPG', 'PNG', 'CDR', 'AI', 'PSD', 'ZIP']).join(', ')} (Max {settings?.max_upload_mb || 15}MB per file).
                  </p>
                </div>
                <label className="px-3.5 py-2 rounded-xl bg-blue-700 hover:bg-blue-600 text-white text-xs font-bold cursor-pointer flex items-center gap-1.5 transition">
                  {uploadingFile ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                  <span>{uploadingFile ? 'Uploading...' : 'Attach Files'}</span>
                  <input
                    type="file"
                    multiple
                    onChange={handleFileUpload}
                    disabled={uploadingFile}
                    className="hidden"
                  />
                </label>
              </div>

              {uploadedFiles.length > 0 ? (
                <div className="space-y-2">
                  {uploadedFiles.map(file => (
                    <div
                      key={file.id}
                      className="flex items-center justify-between px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs"
                    >
                      <div className="flex items-center gap-2 truncate">
                        <FileText className="w-4 h-4 text-blue-600 shrink-0" />
                        <span className="font-semibold text-slate-800 dark:text-slate-200 truncate">{file.file_name}</span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          ({Math.max(1, Math.round(file.file_size / 1024))} KB)
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => handlePreviewFile(file.file_url, file.file_name)}
                          className="text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 text-[11px]"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>View</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setUploadedFiles(prev => prev.filter(f => f.id !== file.id))}
                          className="text-rose-500 hover:text-rose-400 p-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[11px] text-slate-400 italic">
                  No files uploaded yet. Attach artwork or document files for faster review, or submit specs for pre-press guidance.
                </p>
              )}
            </div>

            {/* Step 5: Collection or Delivery Method */}
            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-4 shadow-sm">
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                5. Collection or Lagos Delivery Method
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setCollectionMethod('office_collection')}
                  className={`p-3.5 rounded-xl border text-left transition flex items-start gap-3 ${
                    collectionMethod === 'office_collection'
                      ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-600 ring-1 ring-emerald-600'
                      : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800'
                  }`}
                >
                  <Building2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <span>Office Collection</span>
                      <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 text-[10px] font-mono">
                        ₦0 Fee
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                      Collect directly from our main office once you receive the Ready for Collection alert.
                    </p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setCollectionMethod('paid_delivery')}
                  className={`p-3.5 rounded-xl border text-left transition flex items-start gap-3 ${
                    collectionMethod === 'paid_delivery'
                      ? 'bg-blue-50 dark:bg-blue-950/30 border-blue-600 ring-1 ring-blue-600'
                      : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800'
                  }`}
                >
                  <Truck className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <span>Paid Lagos Delivery</span>
                      <span className="px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-700 dark:text-blue-300 text-[10px] font-mono">
                        Separate Charge
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                      Dispatch to your specified Lagos LGA/LCDA address. Delivery fee is billed separately.
                    </p>
                  </div>
                </button>
              </div>

              {collectionMethod === 'office_collection' ? (
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs space-y-1">
                  <div className="font-bold text-slate-800 dark:text-slate-200">
                    {settings?.office_collection_title || 'HambakTech Main Office Collection Centre'}
                  </div>
                  <p className="text-slate-600 dark:text-slate-400">{settings?.office_collection_address}</p>
                  <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                    Hours: {settings?.office_collection_hours} &bull; No delivery charge (₦0).
                  </p>
                </div>
              ) : (
                <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-800">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                      Lagos Delivery Zone *
                    </label>
                    <select
                      value={deliveryZoneId}
                      onChange={e => handleZoneChange(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white"
                    >
                      {zones.map(z => (
                        <option key={z.id} value={z.id}>
                          {z.destination_group} —{' '}
                          {z.pricing_mode === 'manual_quote'
                            ? 'Manual Quote'
                            : z.pricing_mode === 'free'
                              ? 'Free'
                              : `₦${Number(z.fixed_fee).toLocaleString()}`}{' '}
                          ({z.estimated_eta})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">Recipient Name *</label>
                      <input
                        type="text"
                        required
                        value={recipientName}
                        onChange={e => setRecipientName(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">Recipient Phone *</label>
                      <input
                        type="tel"
                        required
                        value={recipientPhone}
                        onChange={e => setRecipientPhone(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">Lagos Destination *</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Lekki / Ajah / Ikeja"
                        value={deliveryDestination}
                        onChange={e => setDeliveryDestination(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">Lagos LGA / LCDA *</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Eti-Osa LGA"
                        value={deliveryLga}
                        onChange={e => setDeliveryLga(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">Town / Area *</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Sangotedo, Chevron, Yaba"
                        value={deliveryTown}
                        onChange={e => setDeliveryTown(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">Nearby Landmark *</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Opposite Novare Mall"
                        value={deliveryLandmark}
                        onChange={e => setDeliveryLandmark(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">Full Street Address *</label>
                    <input
                      type="text"
                      required
                      placeholder="House/Plot number, Street name, Estate"
                      value={deliveryAddress}
                      onChange={e => setDeliveryAddress(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white"
                    />
                  </div>
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={submittingOrder || uploadingFile}
              className="w-full py-3 rounded-xl bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-white text-xs font-bold flex items-center justify-center gap-2 shadow-md transition"
            >
              {submittingOrder ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              <span>{submittingOrder ? 'Submitting Request...' : 'Submit Printing Request for Review & Quotation'}</span>
            </button>
          </form>

          {/* Right Live Estimate Sticky Summary */}
          <div className="lg:col-span-4 space-y-4 lg:sticky lg:top-20">
            <div className="rounded-2xl bg-slate-900 border border-slate-800 p-5 text-white space-y-4 shadow-lg">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <div>
                  <span className="text-[10px] font-mono uppercase tracking-wider text-emerald-400">Live Cost Estimator</span>
                  <h3 className="text-sm font-bold">{selectedCategory?.name}</h3>
                </div>
                {estimateLoading && <Loader2 className="w-4 h-4 animate-spin text-blue-400" />}
              </div>

              {estimateError ? (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300">
                  {estimateError}
                </div>
              ) : estimate ? (
                <div className="space-y-2.5 text-xs">
                  <div className="flex justify-between text-slate-400">
                    <span>Measurement Basis</span>
                    <span className="font-mono text-slate-200">
                      {estimate.measurement_method === 'per_sq_ft'
                        ? `${estimate.sq_ft} sq.ft × ${estimate.quantity}`
                        : estimate.measurement_method === 'per_linear_ft'
                          ? `${estimate.linear_ft} linear ft × ${estimate.quantity}`
                          : `${estimate.effective_units} ${estimate.unit_label}(s)`}
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-300">
                    <span>Printing Charge</span>
                    <span className="font-mono font-semibold">
                      {estimate.manual_quote_required && estimate.printing_charge === 0
                        ? 'Manual Quote'
                        : `₦${estimate.printing_charge.toLocaleString()}`}
                    </span>
                  </div>
                  {estimate.discount_amount > 0 && (
                    <div className="flex justify-between text-emerald-400">
                      <span>Bulk Discount ({estimate.discount_percent}%)</span>
                      <span className="font-mono">-₦{estimate.discount_amount.toLocaleString()}</span>
                    </div>
                  )}
                  {estimate.finishing_charge > 0 && (
                    <div className="flex justify-between text-slate-300">
                      <span>Finishing Add-ons</span>
                      <span className="font-mono">+₦{estimate.finishing_charge.toLocaleString()}</span>
                    </div>
                  )}
                  {estimate.urgent_charge > 0 && (
                    <div className="flex justify-between text-amber-400">
                      <span>Urgent Priority</span>
                      <span className="font-mono">+₦{estimate.urgent_charge.toLocaleString()}</span>
                    </div>
                  )}
                  <div className="flex justify-between pt-2 border-t border-slate-800 text-slate-200 font-semibold">
                    <span>Printing Subtotal</span>
                    <span className="font-mono">₦{estimate.printing_subtotal.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-slate-300">
                    <span>
                      {estimate.collection_method === 'office_collection'
                        ? 'Office Collection Fee'
                        : 'Separate Delivery Charge'}
                    </span>
                    <span className="font-mono">
                      {estimate.collection_method === 'office_collection'
                        ? '₦0'
                        : estimate.free_delivery_qualified
                          ? '₦0 (Free Qualified)'
                          : estimate.delivery_manual_quote
                            ? 'Manual Quote'
                            : `₦${estimate.delivery_charge.toLocaleString()}`}
                    </span>
                  </div>
                  <div className="flex justify-between items-baseline pt-3 border-t border-slate-700">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Estimated Total</span>
                    <span className="text-xl font-extrabold font-mono text-emerald-400">
                      ₦{estimate.total_estimate.toLocaleString()}
                    </span>
                  </div>
                </div>
              ) : null}

              <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-[11px] text-blue-200 leading-relaxed">
                <strong>Manual Review Notice:</strong> Final pricing is confirmed by our printing team after inspecting your uploaded files and finishing specs. You are only charged after approving the official quotation.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* TAB 2: MY PRINTING ORDERS                                           */}
      {/* =================================================================== */}
      {activeTab === 'orders' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <select
                value={statusFilter}
                onChange={e => {
                  setStatusFilter(e.target.value);
                  loadOrders(e.target.value);
                }}
                className="px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white"
              >
                <option value="all">All Order Statuses</option>
                {ALL_STATUSES.map(st => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => loadOrders(statusFilter)}
                className="p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                title="Refresh Orders"
              >
                <RefreshCw className={`w-4 h-4 ${ordersLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>
            <button
              type="button"
              onClick={() => setActiveTab('submit')}
              className="px-3.5 py-2 rounded-xl bg-blue-700 hover:bg-blue-600 text-white text-xs font-bold flex items-center gap-1.5 self-start sm:self-auto"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Submit New Request</span>
            </button>
          </div>

          {ordersLoading && orders.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500">Loading your printing orders...</div>
          ) : orders.length === 0 ? (
            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-10 text-center space-y-3">
              <Printer className="w-8 h-8 mx-auto text-slate-400" />
              <p className="text-sm font-bold text-slate-800 dark:text-white">No printing orders found</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Submit your first document, banner, ID card, or photo printing request to get started.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {orders.map(order => (
                <div
                  key={order.id}
                  onClick={() => openOrderDetail(order.id)}
                  className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-blue-500/60 p-5 space-y-3 cursor-pointer transition shadow-sm"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-blue-700 dark:text-blue-400">
                          {order.order_reference}
                        </span>
                        <span className={`px-2 py-0.5 rounded-lg border text-[10px] font-semibold ${getStatusBadgeClass(order.status)}`}>
                          {order.status}
                        </span>
                      </div>
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white mt-1">{order.service_title}</h3>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        {order.category_name} &bull; Qty: {order.quantity} &bull;{' '}
                        {order.collection_method === 'paid_delivery' ? 'Paid Delivery' : 'Office Collection'}
                      </p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
                    <div>
                      <span className="text-[10px] text-slate-400 block">Quoted Total</span>
                      <span className="font-mono font-bold text-slate-900 dark:text-white">
                        ₦{Number(order.total_amount).toLocaleString()}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block">Paid</span>
                      <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                        ₦{Number(order.amount_paid).toLocaleString()}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] text-slate-400 block">Payment Status</span>
                      <span className="uppercase font-mono text-[10px] font-bold text-amber-600 dark:text-amber-400">
                        {order.payment_status.replace(/_/g, ' ')}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* =================================================================== */}
      {/* TAB 3: PRINTING PRICE GUIDE                                         */}
      {/* =================================================================== */}
      {activeTab === 'rates' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {categories.map(cat => {
            const Icon = getCategoryIcon(cat.icon);
            return (
              <div
                key={cat.id}
                className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                      <Icon className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white">{cat.name}</h3>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">{cat.description}</p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 text-xs bg-slate-50 dark:bg-slate-950 p-3 rounded-xl border border-slate-200 dark:border-slate-800">
                  <div>
                    <span className="text-[10px] text-slate-400 block">Black &amp; White</span>
                    <span className="font-mono font-bold text-slate-900 dark:text-white">
                      {cat.bw_rate > 0 ? `₦${Number(cat.bw_rate).toLocaleString()}/${cat.unit_label}` : 'Custom Quote'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block">Full Colour</span>
                    <span className="font-mono font-bold text-blue-600 dark:text-blue-400">
                      {cat.color_rate > 0 ? `₦${Number(cat.color_rate).toLocaleString()}/${cat.unit_label}` : 'Custom Quote'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 block">Min Qty / Basis</span>
                    <span className="font-mono font-semibold text-slate-700 dark:text-slate-300">
                      {cat.min_quantity} ({cat.measurement_method.replace(/_/g, ' ')})
                    </span>
                  </div>
                </div>

                {cat.bulk_discounts?.length > 0 && (
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                      Bulk Discounts
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {cat.bulk_discounts.map((d, idx) => (
                        <span
                          key={idx}
                          className="px-2 py-0.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-[10px] font-medium text-emerald-700 dark:text-emerald-300"
                        >
                          {d.label || `${d.min_qty}+: ${d.discount_percent}% off`}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {cat.finishing_options?.length > 0 && (
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Finishing Options
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 text-[11px] text-slate-600 dark:text-slate-300">
                      {cat.finishing_options.map(f => (
                        <div key={f.code} className="flex justify-between pr-2">
                          <span>{f.label}</span>
                          <span className="font-mono">{f.fee > 0 ? `₦${Number(f.fee).toLocaleString()}` : 'Free'}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => {
                    handleSelectCategory(cat);
                    setActiveTab('submit');
                  }}
                  className="w-full py-2 rounded-xl bg-blue-700 hover:bg-blue-600 text-white text-xs font-bold flex items-center justify-center gap-1.5 transition"
                >
                  <span>Request Quotation</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* =================================================================== */}
      {/* TAB 4: DELIVERY INFORMATION                                         */}
      {/* =================================================================== */}
      {activeTab === 'delivery' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-emerald-500/30 p-5 space-y-2 shadow-sm">
              <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 text-xs font-bold">
                <Building2 className="w-4 h-4" />
                <span>Office Collection (Free — ₦0 Delivery Charge)</span>
              </div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                {settings?.office_collection_title}
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-300">{settings?.office_collection_address}</p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Hours: {settings?.office_collection_hours}
              </p>
              <p className="text-[11px] text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 p-2.5 rounded-xl">
                {settings?.collection_notice}
              </p>
            </div>

            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-blue-500/30 p-5 space-y-2 shadow-sm">
              <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 text-xs font-bold">
                <Truck className="w-4 h-4" />
                <span>Paid Lagos Delivery Policy</span>
              </div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Transparent Separate Delivery Billing
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-300">
                {settings?.delivery_notice}
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Dispatch begins only after required printing + delivery payment (or authorized free delivery) and dispatch confirmation are recorded.
              </p>
            </div>
          </div>

          <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Configured Lagos LGAs, LCDAs &amp; Delivery Rates
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400 uppercase text-[10px]">
                  <tr>
                    <th className="px-4 py-3">Destination Axis</th>
                    <th className="px-4 py-3">Lagos LGA / LCDA</th>
                    <th className="px-4 py-3">Towns Covered</th>
                    <th className="px-4 py-3">Delivery Fee</th>
                    <th className="px-4 py-3">Free Delivery Min</th>
                    <th className="px-4 py-3">ETA</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {zones.map(z => (
                    <tr key={z.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="px-4 py-3 font-semibold text-slate-900 dark:text-white">{z.destination_group}</td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{z.lga_lcda}</td>
                      <td className="px-4 py-3 text-slate-500 dark:text-slate-400 max-w-xs">{z.towns_covered}</td>
                      <td className="px-4 py-3 font-mono font-bold text-blue-700 dark:text-blue-400">
                        {z.pricing_mode === 'manual_quote'
                          ? 'Manual Quote'
                          : z.pricing_mode === 'free'
                            ? 'Free'
                            : `₦${Number(z.fixed_fee).toLocaleString()}`}
                      </td>
                      <td className="px-4 py-3 font-mono text-emerald-600 dark:text-emerald-400">
                        {z.free_delivery_enabled && z.free_delivery_min_order > 0
                          ? `₦${Number(z.free_delivery_min_order).toLocaleString()}+`
                          : '—'}
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{z.estimated_eta}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* TAB 5: PRINTING SUPPORT                                             */}
      {/* =================================================================== */}
      {activeTab === 'support' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5 space-y-4">
            <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-4 shadow-sm">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Direct Printing &amp; Pre-Press Desk Contacts
              </h3>
              <div className="space-y-3 text-xs">
                <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                  <Phone className="w-4 h-4 text-blue-600" />
                  <div>
                    <div className="text-[10px] text-slate-400">Printing Support Hotline</div>
                    <div className="font-mono font-bold text-slate-900 dark:text-white">
                      {settings?.printing_support_phone || '09127469686'}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                  <MessageSquare className="w-4 h-4 text-emerald-600" />
                  <div>
                    <div className="text-[10px] text-slate-400">WhatsApp Pre-Press Line</div>
                    <div className="font-mono font-bold text-slate-900 dark:text-white">
                      {settings?.printing_support_whatsapp || '09155104724'}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                  <Mail className="w-4 h-4 text-indigo-600" />
                  <div>
                    <div className="text-[10px] text-slate-400">Support Email</div>
                    <div className="font-mono font-bold text-slate-900 dark:text-white">
                      {settings?.printing_support_email || 'support@hambaktech.com.ng'}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <form
            onSubmit={handleSubmitSupportTicket}
            className="lg:col-span-7 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 space-y-4 shadow-sm"
          >
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Open a Printing Support Ticket
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Order Reference (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. PRT-2026..."
                  value={supportOrderRef}
                  onChange={e => setSupportOrderRef(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Subject *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Artwork check, bulk quote, delivery update..."
                  value={supportSubject}
                  onChange={e => setSupportSubject(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white"
                />
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                Message *
              </label>
              <textarea
                rows={4}
                required
                placeholder="Describe how our printing team can assist you..."
                value={supportMessage}
                onChange={e => setSupportMessage(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white"
              />
            </div>
            <button
              type="submit"
              disabled={supportBusy}
              className="px-5 py-2.5 rounded-xl bg-blue-700 hover:bg-blue-600 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-2"
            >
              {supportBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              <span>Send Printing Support Ticket</span>
            </button>
          </form>
        </div>
      )}

      {/* =================================================================== */}
      {/* ORDER DETAIL MODAL (TRACKING, QUOTE APPROVAL, PAYMENT, MESSAGING)   */}
      {/* =================================================================== */}
      {selectedOrder && (
        <div className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="sticky top-0 z-10 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 p-5 flex items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold text-blue-700 dark:text-blue-400">
                    {selectedOrder.order_reference}
                  </span>
                  <span className={`px-2 py-0.5 rounded-lg border text-[10px] font-bold ${getStatusBadgeClass(selectedOrder.status)}`}>
                    {selectedOrder.status}
                  </span>
                </div>
                <h3 className="text-base font-extrabold text-slate-900 dark:text-white mt-0.5">
                  {selectedOrder.service_title}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedOrder(null)}
                className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {detailLoading ? (
              <div className="p-12 text-center text-xs text-slate-500">Loading order details...</div>
            ) : (
              <div className="p-5 space-y-6">
                {/* Specs & Fulfillment Overview */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2">
                    <div className="font-bold text-slate-900 dark:text-white">Job Specifications</div>
                    <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                      <span className="text-slate-400">Category:</span>
                      <span className="font-medium text-slate-800 dark:text-slate-200">{selectedOrder.category_name}</span>
                      <span className="text-slate-400">Quantity:</span>
                      <span className="font-mono font-bold text-slate-800 dark:text-slate-200">{selectedOrder.quantity}</span>
                      <span className="text-slate-400">Colour Mode:</span>
                      <span className="uppercase font-medium text-slate-800 dark:text-slate-200">{selectedOrder.color_mode}</span>
                      {selectedOrder.paper_size && (
                        <>
                          <span className="text-slate-400">Size / Stock:</span>
                          <span className="text-slate-800 dark:text-slate-200">{selectedOrder.paper_size}</span>
                        </>
                      )}
                      {selectedOrder.width_ft && selectedOrder.height_ft && (
                        <>
                          <span className="text-slate-400">Dimensions:</span>
                          <span className="font-mono text-slate-800 dark:text-slate-200">
                            {selectedOrder.width_ft}ft × {selectedOrder.height_ft}ft ({selectedOrder.sq_ft} sq.ft)
                          </span>
                        </>
                      )}
                    </div>
                    {selectedOrder.uploaded_files?.length > 0 && (
                      <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-1">
                        <span className="text-[10px] font-bold uppercase text-slate-400">Uploaded Artwork / Docs</span>
                        {selectedOrder.uploaded_files.map(f => (
                          <button
                            key={f.id}
                            type="button"
                            onClick={() => handlePreviewFile(f.file_url, f.file_name)}
                            className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-[11px] text-blue-600 dark:text-blue-400 hover:underline"
                          >
                            <span className="truncate">{f.file_name}</span>
                            <Eye className="w-3.5 h-3.5 shrink-0" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Financial Quotation Breakdown (Customer-safe only) */}
                  <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-2">
                    <div className="font-bold text-slate-900 dark:text-white flex items-center justify-between">
                      <span>Quotation &amp; Payment Breakdown</span>
                      <span className="uppercase text-[10px] font-mono px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400">
                        {selectedOrder.payment_status.replace(/_/g, ' ')}
                      </span>
                    </div>
                    <div className="space-y-1 text-[11px]">
                      <div className="flex justify-between">
                        <span className="text-slate-500">Printing Charge</span>
                        <span className="font-mono">₦{Number(selectedOrder.printing_charge).toLocaleString()}</span>
                      </div>
                      {Number(selectedOrder.finishing_charge) > 0 && (
                        <div className="flex justify-between">
                          <span className="text-slate-500">Finishing</span>
                          <span className="font-mono">₦{Number(selectedOrder.finishing_charge).toLocaleString()}</span>
                        </div>
                      )}
                      {Number(selectedOrder.urgent_charge) > 0 && (
                        <div className="flex justify-between">
                          <span className="text-amber-600">Urgent Priority</span>
                          <span className="font-mono">₦{Number(selectedOrder.urgent_charge).toLocaleString()}</span>
                        </div>
                      )}
                      {Number(selectedOrder.discount_amount) > 0 && (
                        <div className="flex justify-between text-emerald-600">
                          <span>Discount</span>
                          <span className="font-mono">-₦{Number(selectedOrder.discount_amount).toLocaleString()}</span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span className="text-slate-500">
                          {selectedOrder.collection_method === 'office_collection' ? 'Office Collection' : 'Separate Delivery Fee'}
                        </span>
                        <span className="font-mono">
                          {selectedOrder.free_delivery_authorized
                            ? '₦0 (Free Authorized)'
                            : `₦${Number(selectedOrder.delivery_charge).toLocaleString()}`}
                        </span>
                      </div>
                      <div className="flex justify-between pt-2 border-t border-slate-200 dark:border-slate-800 font-bold text-xs text-slate-900 dark:text-white">
                        <span>Total Quotation</span>
                        <span className="font-mono">₦{Number(selectedOrder.total_amount).toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between text-emerald-600 dark:text-emerald-400 font-semibold">
                        <span>Amount Paid</span>
                        <span className="font-mono">₦{Number(selectedOrder.amount_paid).toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between text-amber-600 dark:text-amber-400 font-bold">
                        <span>Balance Due</span>
                        <span className="font-mono">₦{Number(selectedOrder.balance_due).toLocaleString()}</span>
                      </div>
                      {selectedOrder.deposit_enabled && (
                        <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 text-[10px]">
                          Deposit arrangement enabled: Minimum initial deposit <strong>₦{Number(selectedOrder.deposit_amount).toLocaleString()}</strong> ({selectedOrder.deposit_percent}%).
                        </div>
                      )}
                      {selectedOrder.quote_notes && (
                        <div className="p-2 rounded-lg bg-blue-500/10 text-blue-700 dark:text-blue-300 text-[11px] mt-1">
                          <strong>Quote Note:</strong> {selectedOrder.quote_notes}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Delivery / Collection Info */}
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-start gap-2">
                    <MapPin className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold text-slate-900 dark:text-white">
                        {selectedOrder.collection_method === 'paid_delivery'
                          ? `Lagos Delivery — ${selectedOrder.delivery_lga_lcda}`
                          : 'Main Office Collection (₦0)'}
                      </span>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        {selectedOrder.collection_method === 'paid_delivery'
                          ? `${selectedOrder.delivery_recipient_name} (${selectedOrder.delivery_recipient_phone}) • ${selectedOrder.delivery_address}, ${selectedOrder.delivery_town} (Landmark: ${selectedOrder.delivery_landmark})`
                          : settings?.office_collection_address}
                      </p>
                      {selectedOrder.tracking_note && (
                        <p className="text-[11px] text-sky-600 dark:text-sky-400 font-semibold mt-0.5">
                          Dispatch Update: {selectedOrder.tracking_note}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Customer Quotation Approve / Decline Buttons */}
                {selectedOrder.status === 'Quotation Sent' && (
                  <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <h4 className="text-xs font-bold text-amber-800 dark:text-amber-300">
                          Official Quotation Awaiting Your Approval
                        </h4>
                        <p className="text-[11px] text-amber-700/80 dark:text-amber-400/80">
                          Approve the quotation to proceed to payment, or decline with feedback.
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={actionBusy}
                          onClick={() => handleQuoteDecision('approve')}
                          className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Approve Quotation</span>
                        </button>
                        <button
                          type="button"
                          disabled={actionBusy}
                          onClick={() => setShowDeclineBox(v => !v)}
                          className="px-3.5 py-2 rounded-xl bg-rose-600/15 hover:bg-rose-600/25 text-rose-700 dark:text-rose-300 text-xs font-bold flex items-center gap-1.5"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          <span>Decline</span>
                        </button>
                      </div>
                    </div>

                    {showDeclineBox && (
                      <div className="flex flex-col sm:flex-row gap-2 pt-2">
                        <input
                          type="text"
                          placeholder="Optional reason for declining quotation..."
                          value={quoteDeclineReason}
                          onChange={e => setQuoteDeclineReason(e.target.value)}
                          className="flex-1 px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
                        />
                        <button
                          type="button"
                          disabled={actionBusy}
                          onClick={() => handleQuoteDecision('decline')}
                          className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold"
                        >
                          Confirm Decline
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Payment Section */}
                {['Quotation Sent', 'Awaiting Payment', 'Payment Confirmed', 'Processing', 'On Hold', 'Ready for Collection', 'Ready for Dispatch'].includes(selectedOrder.status) &&
                  Number(selectedOrder.balance_due) > 0.01 &&
                  Number(selectedOrder.total_amount) > 0 && (
                    <form
                      onSubmit={handlePayOrder}
                      className="p-4 rounded-xl bg-blue-500/5 border border-blue-500/30 space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                          <Wallet className="w-4 h-4 text-blue-600" />
                          <span>Complete Printing Payment (Balance Due: ₦{Number(selectedOrder.balance_due).toLocaleString()})</span>
                        </h4>
                        <span className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400">
                          Wallet: ₦{Number(user?.wallet_balance || 0).toLocaleString()}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">Payment Scope</label>
                          <select
                            value={payScope}
                            onChange={e => setPayScope(e.target.value as any)}
                            className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800"
                          >
                            <option value="full">
                              Pay Full Balance (₦{Number(selectedOrder.balance_due).toLocaleString()})
                            </option>
                            {selectedOrder.deposit_enabled && Number(selectedOrder.amount_paid) === 0 && (
                              <option value="deposit">
                                Pay Initial Deposit ({selectedOrder.deposit_percent}% — ₦{Number(selectedOrder.deposit_amount).toLocaleString()})
                              </option>
                            )}
                            {Number(selectedOrder.amount_paid) > 0 && (
                              <option value="balance">
                                Pay Remaining Balance (₦{Number(selectedOrder.balance_due).toLocaleString()})
                              </option>
                            )}
                            {selectedOrder.collection_method === 'paid_delivery' &&
                              Number(selectedOrder.delivery_charge) > 0 &&
                              selectedOrder.delivery_payment_status === 'pending' && (
                                <option value="delivery">
                                  Pay Delivery Charge Only (₦{Number(selectedOrder.delivery_charge).toLocaleString()})
                                </option>
                              )}
                          </select>
                        </div>

                        <div>
                          <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">Payment Method</label>
                          <select
                            value={payGateway}
                            onChange={e => setPayGateway(e.target.value as any)}
                            className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800"
                          >
                            <option value="wallet">HambakTech Wallet (Instant)</option>
                            <option value="manual_transfer">Manual Bank Transfer (Admin Confirmed)</option>
                            <option value="paystack">Paystack Online Checkout</option>
                            <option value="flutterwave">Flutterwave Online Checkout</option>
                          </select>
                        </div>
                      </div>

                      {payGateway === 'wallet' && (
                        <div className="space-y-2">
                          <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                            4-Digit Transaction PIN *
                          </label>
                          <div className="flex flex-wrap items-center gap-2">
                            <input
                              type="password"
                              maxLength={6}
                              required
                              placeholder="Enter Transaction PIN"
                              value={txPin}
                              onChange={e => setTxPin(e.target.value)}
                              className="px-3 py-2 rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-mono w-48"
                            />
                            {!user?.has_transaction_pin && onNavigateToSecurity && (
                              <button
                                type="button"
                                onClick={onNavigateToSecurity}
                                className="text-[11px] text-amber-600 dark:text-amber-400 hover:underline flex items-center gap-1"
                              >
                                <Lock className="w-3 h-3" />
                                <span>Set Transaction PIN first</span>
                              </button>
                            )}
                          </div>
                        </div>
                      )}

                      {payGateway === 'manual_transfer' && (
                        <div className="space-y-2 p-3 rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs">
                          <div className="font-bold text-slate-900 dark:text-white">
                            Transfer to: {bankDetails?.bank || 'Moniepoint MFB'} &bull;{' '}
                            <span className="font-mono">{bankDetails?.accountNumber || '5210471634'}</span> ({bankDetails?.accountName || 'Hambaktech_Services'})
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                            <input
                              type="text"
                              required
                              placeholder="Sender / Payer Name"
                              value={payerName}
                              onChange={e => setPayerName(e.target.value)}
                              className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
                            />
                            <input
                              type="text"
                              required
                              placeholder="Bank Session / Transfer Ref"
                              value={bankReference}
                              onChange={e => setBankReference(e.target.value)}
                              className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
                            />
                            <input
                              type="text"
                              placeholder="Remarks / Narration (Optional)"
                              value={payRemarks}
                              onChange={e => setPayRemarks(e.target.value)}
                              className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
                            />
                          </div>
                          <div className="flex items-center gap-2 pt-1">
                            <input
                              type="text"
                              placeholder="Receipt / Proof URL (or upload below)"
                              value={proofUrl}
                              onChange={e => setProofUrl(e.target.value)}
                              className="flex-1 px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
                            />
                            <label className="px-3 py-1.5 rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-[11px] font-semibold cursor-pointer">
                              Upload Proof
                              <input
                                type="file"
                                className="hidden"
                                onChange={async e => {
                                  const f = e.target.files?.[0];
                                  if (!f) return;
                                  try {
                                    const up = await api.uploadPrintingFile(f);
                                    if (up.file_url) setProofUrl(up.file_url);
                                  } catch (err: any) {
                                    setGlobalError(err.message || 'Proof upload failed.');
                                  }
                                }}
                              />
                            </label>
                          </div>
                        </div>
                      )}

                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="submit"
                          disabled={actionBusy}
                          className="px-4 py-2 rounded-xl bg-blue-700 hover:bg-blue-600 text-white text-xs font-bold flex items-center gap-1.5"
                        >
                          {actionBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                          <span>
                            {payGateway === 'wallet'
                              ? 'Pay Immediately with Wallet'
                              : payGateway === 'manual_transfer'
                                ? 'Submit Bank Transfer Proof'
                                : `Proceed with ${payGateway}`}
                          </span>
                        </button>

                        {pendingCheckoutUrl && (
                          <a
                            href={pendingCheckoutUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold flex items-center gap-1.5"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            <span>Open Gateway Checkout</span>
                          </a>
                        )}

                        {pendingVerifyRef && (
                          <button
                            type="button"
                            disabled={actionBusy}
                            onClick={handleVerifyGatewayPayment}
                            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold"
                          >
                            Confirm / Verify Payment ({pendingVerifyRef})
                          </button>
                        )}
                      </div>
                    </form>
                  )}

                {/* Cancel button if still cancellable */}
                {!['Processing', 'Ready for Collection', 'Ready for Dispatch', 'Out for Delivery', 'Completed', 'Cancelled', 'Refunded'].includes(selectedOrder.status) && (
                  <div className="flex justify-end">
                    <button
                      type="button"
                      disabled={actionBusy}
                      onClick={handleCancelOrder}
                      className="px-3 py-1.5 rounded-lg border border-rose-500/30 text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 text-[11px] font-semibold"
                    >
                      Cancel Request
                    </button>
                  </div>
                )}

                {/* Order Status Timeline & Messages */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3">
                    <h4 className="text-xs font-bold text-slate-900 dark:text-white">
                      Order Status History
                    </h4>
                    <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
                      {orderHistory.map(h => (
                        <div key={h.id} className="text-[11px] border-l-2 border-blue-600 pl-3 space-y-0.5">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-slate-900 dark:text-white">{h.to_status}</span>
                            <span className="text-[10px] text-slate-400 font-mono">
                              {new Date(h.created_at).toLocaleString()}
                            </span>
                          </div>
                          {h.note && <p className="text-slate-600 dark:text-slate-300">{h.note}</p>}
                          <span className="text-[10px] text-slate-400">By {h.actor_name} ({h.actor_role})</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-3 flex flex-col">
                    <h4 className="text-xs font-bold text-slate-900 dark:text-white">
                      Printing Desk Communication
                    </h4>
                    <div className="space-y-2 max-h-48 overflow-y-auto flex-1 pr-1">
                      {orderMessages.length === 0 ? (
                        <p className="text-[11px] text-slate-400 italic">No messages yet. Ask any question about your order below.</p>
                      ) : (
                        orderMessages.map(m => (
                          <div
                            key={m.id}
                            className={`p-2.5 rounded-xl text-[11px] ${
                              m.sender_role === 'customer'
                                ? 'bg-blue-600/10 border border-blue-500/20 ml-4'
                                : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 mr-4'
                            }`}
                          >
                            <div className="flex justify-between text-[10px] text-slate-400 mb-0.5">
                              <span className="font-semibold text-slate-700 dark:text-slate-300">
                                {m.sender_name} ({m.sender_role})
                              </span>
                              <span>{new Date(m.created_at).toLocaleTimeString()}</span>
                            </div>
                            <p className="text-slate-800 dark:text-slate-200">{m.message}</p>
                          </div>
                        ))
                      )}
                    </div>
                    <form onSubmit={handleSendMessage} className="flex gap-2 pt-1">
                      <input
                        type="text"
                        placeholder="Write a message to printing team..."
                        value={chatMessage}
                        onChange={e => setChatMessage(e.target.value)}
                        className="flex-1 px-3 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs"
                      />
                      <button
                        type="submit"
                        disabled={actionBusy || !chatMessage.trim()}
                        className="px-3 py-2 rounded-xl bg-blue-700 hover:bg-blue-600 text-white text-xs font-bold"
                      >
                        <Send className="w-3.5 h-3.5" />
                      </button>
                    </form>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Inline File Preview Modal */}
      {previewFile && (
        <div className="fixed inset-0 z-[60] bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
            <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <FileText className="w-4 h-4 text-blue-600 shrink-0" />
                <span className="text-sm font-bold text-slate-900 dark:text-white truncate">
                  {previewFile.name}
                </span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 shrink-0">
                  {previewFile.mimeType}
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <a
                  href={previewFile.url}
                  download={previewFile.name}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download</span>
                </a>
                <button
                  type="button"
                  onClick={closePreviewModal}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="flex-1 bg-slate-100 dark:bg-slate-950 flex items-center justify-center p-4 overflow-auto min-h-[360px]">
              {previewFile.mimeType.startsWith('image/') ? (
                <img
                  src={previewFile.url}
                  alt={previewFile.name}
                  className="max-w-full max-h-[72vh] object-contain rounded-lg shadow"
                />
              ) : previewFile.mimeType === 'application/pdf' ? (
                <iframe
                  src={previewFile.url}
                  title={previewFile.name}
                  className="w-full h-[72vh] rounded-lg border border-slate-200 dark:border-slate-800 bg-white"
                />
              ) : (
                <div className="text-center space-y-3 py-8">
                  <FileText className="w-10 h-10 text-slate-400 mx-auto" />
                  <p className="text-xs text-slate-600 dark:text-slate-300">
                    Inline browser preview is not supported for <strong>{previewFile.mimeType}</strong>. Use Download to inspect the file locally.
                  </p>
                  <a
                    href={previewFile.url}
                    download={previewFile.name}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download File</span>
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
