// src/pages/admin/marketing/components/MailerRoutesPanel.jsx

import React, { useEffect, useMemo, useState } from 'react';
import styles from '../../MarketingOps.module.css';
import {
  addMailerRoute,
  createEmptyMailerRouteForm,
  deleteMailerRoute,
  getMailerRouteSummary,
  getMailerRoutesByActivity,
  searchMockEddmRoutesByZip,
  updateMailerRoute,
} from '../services/eddmRouteService';

const money = (value) =>
  Number(value || 0).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  });

const number = (value) =>
  Number(value || 0).toLocaleString('en-US');

const isMailerActivity = (activity = {}) => {
  const type = String(activity.activityType || activity.activity_type || '').toLowerCase();
  return type === 'mailers' || type === 'mailer' || type === 'direct_mail';
};

const MailerRoutesPanel = ({
  activity,
  formData,
  updateForm,
}) => {
  const activityId = activity?.id || null;
  const campaignId = formData?.campaignId || activity?.campaignId || activity?.campaign_id || null;
  const office = formData?.office || activity?.office || '';

  const [routes, setRoutes] = useState([]);
  const [routeForm, setRouteForm] = useState(createEmptyMailerRouteForm);
  const [editingRouteId, setEditingRouteId] = useState(null);
  const [searchZip, setSearchZip] = useState('');
  const [mockResults, setMockResults] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState('');

  const summary = useMemo(() => getMailerRouteSummary(routes), [routes]);

  useEffect(() => {
    let isMounted = true;

    const loadRoutes = async () => {
      if (!activityId) return;

      setIsLoading(true);
      setError('');

      try {
        const nextRoutes = await getMailerRoutesByActivity(activityId);
        if (isMounted) setRoutes(nextRoutes);
      } catch (loadError) {
        console.error('Error loading mailer routes:', loadError);
        if (isMounted) setError(loadError?.message || 'Could not load mailer routes.');
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    loadRoutes();

    return () => {
      isMounted = false;
    };
  }, [activityId]);

  useEffect(() => {
    if (!updateForm) return;
    updateForm('quantity', summary.totalCount ? String(summary.totalCount) : formData.quantity);
    updateForm('cost', summary.estimatedTotalCost ? String(summary.estimatedTotalCost) : formData.cost);
  }, [summary.totalCount, summary.estimatedTotalCost]);

  const updateRouteForm = (field, value) => {
    setRouteForm((prev) => {
      const next = {
        ...prev,
        [field]: value,
      };

      const residential = Number(next.residentialCount || 0);
      const business = Number(next.businessCount || 0);
      const total = Number(next.totalCount || 0) || residential + business;
      const postage = Number(next.estimatedPostage || 0);
      const print = Number(next.estimatedPrintCost || 0);
      const totalCost = Number(next.estimatedTotalCost || 0) || postage + print;

      return {
        ...next,
        totalCount: total ? String(total) : '',
        estimatedTotalCost: totalCost ? String(totalCost) : '',
      };
    });
  };

  const resetRouteForm = () => {
    setRouteForm(createEmptyMailerRouteForm());
    setEditingRouteId(null);
    setError('');
  };

  const handleSaveRoute = async (event) => {
    event.preventDefault();

    if (!activityId) {
      setError('Save the activity first, then add EDDM routes.');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      let saved;

      if (editingRouteId) {
        saved = await updateMailerRoute(editingRouteId, routeForm);
        setRoutes((prev) => prev.map((route) => (route.id === saved.id ? saved : route)));
      } else {
        saved = await addMailerRoute({
          activityId,
          campaignId,
          office,
          route: routeForm,
        });
        setRoutes((prev) => [...prev, saved]);
      }

      resetRouteForm();
    } catch (saveError) {
      console.error('Error saving mailer route:', saveError);
      setError(saveError?.message || 'Could not save mailer route.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleEdit = (route) => {
    setEditingRouteId(route.id);
    setRouteForm({
      zipCode: route.zipCode || '',
      routeId: route.routeId || '',
      zipCrid: route.zipCrid || '',
      residentialCount: route.residentialCount || '',
      businessCount: route.businessCount || '',
      totalCount: route.totalCount || '',
      estimatedPostage: route.estimatedPostage || '',
      estimatedPrintCost: route.estimatedPrintCost || '',
      estimatedTotalCost: route.estimatedTotalCost || '',
      facilityName: route.facilityName || '',
      dropShipKey: route.dropShipKey || '',
      lessThan200Indicator: route.lessThan200Indicator || '',
      notes: route.notes || '',
    });
  };

  const handleDelete = async (routeId) => {
    const confirmed = window.confirm('Delete this mailer route?');
    if (!confirmed) return;

    setIsLoading(true);
    setError('');

    try {
      await deleteMailerRoute(routeId);
      setRoutes((prev) => prev.filter((route) => route.id !== routeId));
    } catch (deleteError) {
      console.error('Error deleting mailer route:', deleteError);
      setError(deleteError?.message || 'Could not delete mailer route.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleMockSearch = async () => {
    setIsSearching(true);
    setError('');

    try {
      const results = await searchMockEddmRoutesByZip({ zipCode: searchZip });
      setMockResults(results);
    } catch (searchError) {
      setError(searchError?.message || 'Could not search routes.');
    } finally {
      setIsSearching(false);
    }
  };

  const addMockResult = async (result) => {
    if (!activityId) {
      setError('Save the activity first, then add EDDM routes.');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const saved = await addMailerRoute({
        activityId,
        campaignId,
        office,
        route: result,
      });
      setRoutes((prev) => [...prev, saved]);
    } catch (addError) {
      setError(addError?.message || 'Could not add route.');
    } finally {
      setIsLoading(false);
    }
  };

  const visibleAsWarning = !isMailerActivity(formData || activity || {});

  return (
    <section style={{ display: 'grid', gap: 14 }}>
      {visibleAsWarning && (
        <div style={{ border: '1px solid #fde68a', background: '#fffbeb', color: '#92400e', borderRadius: 14, padding: 12, fontWeight: 850, fontSize: 12 }}>
          This tab is mainly for Mailer activities. You can still enter route data, but it will be most useful when the activity type is Mailers.
        </div>
      )}

      {!activityId && (
        <div className={styles.errorBanner}>
          Save the activity first. After it has an ID, you can add selected EDDM routes.
        </div>
      )}

      {error && <div className={styles.errorBanner}>{error}</div>}

      <div className={styles.kpiGrid}>
        <RouteKpi label="Routes" value={summary.routeCount} helper="Selected carrier routes" />
        <RouteKpi label="Mail Pieces" value={number(summary.totalCount)} helper={`${number(summary.residentialCount)} residential / ${number(summary.businessCount)} business`} />
        <RouteKpi label="Postage" value={money(summary.estimatedPostage)} helper="Estimated postage" />
        <RouteKpi label="Total Cost" value={money(summary.estimatedTotalCost)} helper="Postage + print cost" />
      </div>

      <div style={{ border: '1px solid #e2e8f0', borderRadius: 16, padding: 12, background: '#ffffff', display: 'grid', gap: 10 }}>
        <div>
          <h3 style={{ margin: 0 }}>Manual Route Entry</h3>
          <p style={{ margin: '4px 0 0', color: '#64748b', fontWeight: 750, fontSize: 12 }}>
            Use this now while USPS API access is pending. Enter the selected EDDM routes, pieces, and estimated costs from USPS.
          </p>
        </div>

        <form onSubmit={handleSaveRoute} className={styles.formGrid}>
          <label>
            ZIP Code
            <input value={routeForm.zipCode} onChange={(event) => updateRouteForm('zipCode', event.target.value)} placeholder="95340" maxLength={5} />
          </label>

          <label>
            Route ID
            <input value={routeForm.routeId} onChange={(event) => updateRouteForm('routeId', event.target.value)} placeholder="C001" />
          </label>

          <label>
            ZIP_CRID
            <input value={routeForm.zipCrid} onChange={(event) => updateRouteForm('zipCrid', event.target.value)} placeholder="95340_C001" />
          </label>

          <label>
            Facility Name
            <input value={routeForm.facilityName} onChange={(event) => updateRouteForm('facilityName', event.target.value)} placeholder="Merced Post Office" />
          </label>

          <label>
            Residential Count
            <input type="number" value={routeForm.residentialCount} onChange={(event) => updateRouteForm('residentialCount', event.target.value)} placeholder="700" />
          </label>

          <label>
            Business Count
            <input type="number" value={routeForm.businessCount} onChange={(event) => updateRouteForm('businessCount', event.target.value)} placeholder="35" />
          </label>

          <label>
            Total Pieces
            <input type="number" value={routeForm.totalCount} onChange={(event) => updateRouteForm('totalCount', event.target.value)} placeholder="735" />
          </label>

          <label>
            Less Than 200?
            <select value={routeForm.lessThan200Indicator} onChange={(event) => updateRouteForm('lessThan200Indicator', event.target.value)}>
              <option value="">Unknown</option>
              <option value="N">No</option>
              <option value="Y">Yes</option>
            </select>
          </label>

          <label>
            Estimated Postage
            <input type="number" step="0.01" value={routeForm.estimatedPostage} onChange={(event) => updateRouteForm('estimatedPostage', event.target.value)} placeholder="147.00" />
          </label>

          <label>
            Estimated Print Cost
            <input type="number" step="0.01" value={routeForm.estimatedPrintCost} onChange={(event) => updateRouteForm('estimatedPrintCost', event.target.value)} placeholder="220.50" />
          </label>

          <label>
            Estimated Total Cost
            <input type="number" step="0.01" value={routeForm.estimatedTotalCost} onChange={(event) => updateRouteForm('estimatedTotalCost', event.target.value)} placeholder="367.50" />
          </label>

          <label>
            Drop Ship Key
            <input value={routeForm.dropShipKey} onChange={(event) => updateRouteForm('dropShipKey', event.target.value)} placeholder="Optional" />
          </label>

          <label className={styles.fullWidth}>
            Notes
            <textarea value={routeForm.notes} onChange={(event) => updateRouteForm('notes', event.target.value)} placeholder="Internal notes about this route..." rows={3} />
          </label>

          <div className={styles.fullWidth} style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            {editingRouteId && (
              <button type="button" className={styles.secondaryBtn} onClick={resetRouteForm}>
                Cancel Edit
              </button>
            )}
            <button type="submit" className={styles.primaryBtn} disabled={isLoading || !activityId}>
              {editingRouteId ? 'Save Route' : '+ Add Route'}
            </button>
          </div>
        </form>
      </div>

      <div style={{ border: '1px solid #dbeafe', borderRadius: 16, padding: 12, background: '#eff6ff', display: 'grid', gap: 10 }}>
        <div>
          <h3 style={{ margin: 0 }}>USPS Route Search Preview</h3>
          <p style={{ margin: '4px 0 0', color: '#64748b', fontWeight: 750, fontSize: 12 }}>
            This uses mock data for now. When USPS approves EDDM access, this area will call the live USPS API.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            value={searchZip}
            onChange={(event) => setSearchZip(event.target.value)}
            placeholder="Search ZIP"
            maxLength={5}
            style={{ flex: '1 1 180px', border: '1px solid #bfdbfe', borderRadius: 12, padding: '9px 10px', fontWeight: 800 }}
          />
          <button type="button" className={styles.secondaryBtn} onClick={handleMockSearch} disabled={isSearching}>
            {isSearching ? 'Searching...' : 'Preview Routes'}
          </button>
        </div>

        {mockResults.length > 0 && (
          <div style={{ display: 'grid', gap: 8 }}>
            {mockResults.map((route) => (
              <RouteRow
                key={`${route.zipCode}-${route.routeId}`}
                route={route}
                onAdd={() => addMockResult(route)}
                isMock
              />
            ))}
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gap: 10 }}>
        <h3 style={{ margin: 0 }}>Selected Routes</h3>

        {isLoading ? (
          <div className={styles.emptyState}>Loading routes...</div>
        ) : routes.length === 0 ? (
          <div className={styles.emptyState}>No EDDM routes saved for this activity yet.</div>
        ) : (
          routes.map((route) => (
            <RouteRow
              key={route.id}
              route={route}
              onEdit={() => handleEdit(route)}
              onDelete={() => handleDelete(route.id)}
            />
          ))
        )}
      </div>
    </section>
  );
};

const RouteKpi = ({ label, value, helper }) => (
  <div className={styles.kpiCard}>
    <span className={styles.kpiLabel}>{label}</span>
    <strong>{value}</strong>
    <small>{helper}</small>
  </div>
);

const RouteRow = ({ route, onEdit, onDelete, onAdd, isMock = false }) => (
  <article
    style={{
      border: '1px solid #e2e8f0',
      borderRadius: 14,
      padding: 12,
      background: '#ffffff',
      display: 'grid',
      gap: 8,
    }}
  >
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
      <div>
        <strong style={{ display: 'block', color: '#0f172a' }}>
          {route.zipCode} • {route.routeId}
        </strong>
        <small style={{ color: '#64748b', fontWeight: 800 }}>
          {route.facilityName || 'No facility'} {route.lessThan200Indicator ? `• Less than 200: ${route.lessThan200Indicator}` : ''}
        </small>
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        {onAdd && (
          <button type="button" className={styles.primaryBtn} onClick={onAdd}>
            Add
          </button>
        )}
        {onEdit && (
          <button type="button" className={styles.secondaryBtn} onClick={onEdit}>
            Edit
          </button>
        )}
        {onDelete && (
          <button type="button" className={styles.dangerBtn} onClick={onDelete}>
            Delete
          </button>
        )}
      </div>
    </div>

    <div className={styles.detailGrid}>
      <div>
        <span>Residential</span>
        <strong>{number(route.residentialCount)}</strong>
      </div>
      <div>
        <span>Business</span>
        <strong>{number(route.businessCount)}</strong>
      </div>
      <div>
        <span>Total Pieces</span>
        <strong>{number(route.totalCount)}</strong>
      </div>
      <div>
        <span>Total Cost</span>
        <strong>{money(route.estimatedTotalCost)}</strong>
      </div>
    </div>

    {route.notes && (
      <p style={{ margin: 0, color: '#64748b', fontWeight: 750, fontSize: 12 }}>
        {route.notes}
      </p>
    )}

    {isMock && (
      <small style={{ color: '#0369a1', fontWeight: 900 }}>
        Preview route. This is not live USPS data yet.
      </small>
    )}
  </article>
);

export default MailerRoutesPanel;
