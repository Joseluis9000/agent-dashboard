import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../supabaseClient';
import styles from './ManageViolations.module.css';

const getWeekRange = (date) => {
  const d = new Date(date);
  const todayUTC = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayOfWeek = todayUTC.getUTCDay();
  const diff = todayUTC.getUTCDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);

  const monday = new Date(Date.UTC(todayUTC.getUTCFullYear(), todayUTC.getUTCMonth(), diff));
  const sunday = new Date(Date.UTC(todayUTC.getUTCFullYear(), todayUTC.getUTCMonth(), diff + 6));

  return {
    start: monday.toISOString().split('T')[0],
    end: sunday.toISOString().split('T')[0],
  };
};

const ViolationTable = ({
  violations,
  onStatusChange,
  agentNameMap,
  onEdit,
  onDelete,
  type,
}) => (
  <div className={styles.tableCardModern}>
    <div className={styles.tableContainer}>
      <table className={styles.modernTable}>
        <thead>
          <tr>
            <th>Date</th>
            <th>Agent</th>
            <th>Office</th>
            <th>Region</th>
            <th>Category</th>
            <th>Client / Policy</th>
            <th>Details</th>
            <th>Variance</th>
            <th>Fee</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>

        <tbody>
          {violations.length > 0 ? (
            violations.map((v) => (
              <tr key={`${type}-${v.id}`}>
                <td>
                  {new Date(
                    (v.created_at || v.reported_date) + ''
                  ).toLocaleDateString()}
                </td>

                <td>
                  {agentNameMap[v.agent_email] ||
                    v.agent_email?.split('@')[0] ||
                    'N/A'}
                </td>

                <td>{v.office_code || '—'}</td>

                <td>{v.region || '—'}</td>

                <td>
                  <span className={styles.categoryBadge}>
                    {v.violation_category || '—'}
                  </span>
                </td>

                <td>
                  <div className={styles.clientCell}>
                    <strong>{v.client_name}</strong>

                    <span className={styles.refId}>
                      {v.policy_number ||
                        v.customer_id ||
                        v.reference_id ||
                        'N/A'}
                    </span>
                  </div>
                </td>

                <td>{v.details || '—'}</td>

                <td>${Number(v.variance_amount || 0).toFixed(2)}</td>

                <td>${Number(v.fee_amount || 0).toFixed(2)}</td>

                <td>
                  <select
                    value={v.status || 'Pending'}
                    onChange={(e) =>
                      onStatusChange(v.id, e.target.value, type)
                    }
                    className={`${styles.statusSelect} ${
                      styles[(v.status || 'Pending').toLowerCase()]
                    }`}
                  >
                    <option value="Pending">Pending</option>
                    <option value="Charged">Charged</option>
                    <option value="Voided">Voided</option>
                  </select>
                </td>

                <td>
                  <div className={styles.actionButtons}>
                    <button
                      onClick={() => onEdit(v)}
                      className={styles.editButton}
                    >
                      Edit
                    </button>

                    <button
                      onClick={() => onDelete(v.id, type)}
                      className={styles.deleteButton}
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan="11" className={styles.emptyState}>
                No records for this period.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  </div>
);

const ManageViolations = () => {
  const navigate = useNavigate();

  const [currentDate, setCurrentDate] = useState(new Date());

  const [violations, setViolations] = useState([]);
  const [disqualifiedPolicies, setDisqualifiedPolicies] = useState([]);

  const [loading, setLoading] = useState(true);

  const [agentNameMap, setAgentNameMap] = useState({});

  const [activeTab, setActiveTab] = useState('ar');

  const week = useMemo(() => getWeekRange(currentDate), [currentDate]);

  useEffect(() => {
    const fetchAgentNames = async () => {
      const { data } = await supabase
        .from('profiles')
        .select('email, full_name');

      const nameMap = (data || []).reduce((acc, profile) => {
        acc[profile.email] = profile.full_name || profile.email;
        return acc;
      }, {});

      setAgentNameMap(nameMap);
    };

    fetchAgentNames();
  }, []);

  const fetchViolations = useCallback(async () => {
    setLoading(true);

    const { data: violationsData } = await supabase
      .from('violations')
      .select('*')
      .eq('week_start_date', week.start)
      .order('created_at', { ascending: false });

    const { data: disqualifiedData } = await supabase
      .from('disqualified_policies')
      .select('*')
      .eq('week_start_date', week.start)
      .order('created_at', { ascending: false });

    setViolations(violationsData || []);
    setDisqualifiedPolicies(disqualifiedData || []);

    setLoading(false);
  }, [week.start]);

  useEffect(() => {
    fetchViolations();
  }, [fetchViolations]);

  const handleStatusChange = async (id, newStatus, type) => {
    const table =
      type === 'disqualified'
        ? 'disqualified_policies'
        : 'violations';

    const { error } = await supabase
      .from(table)
      .update({ status: newStatus })
      .eq('id', id);

    if (error) {
      alert(error.message);
    } else {
      fetchViolations();
    }
  };

  const handleEdit = (violationToEdit) => {
    navigate('/admin/enter-violation', {
      state: { violationToEdit },
    });
  };

  const handleDelete = async (id, type) => {
    if (
      !window.confirm(
        'Are you sure you want to delete this record?'
      )
    )
      return;

    const table =
      type === 'disqualified'
        ? 'disqualified_policies'
        : 'violations';

    const { error } = await supabase
      .from(table)
      .delete()
      .eq('id', id);

    if (error) {
      alert(error.message);
    } else {
      fetchViolations();
    }
  };

  const goToPreviousWeek = () => {
    const newDate = new Date(currentDate);
    newDate.setDate(newDate.getDate() - 7);
    setCurrentDate(newDate);
  };

  const goToNextWeek = () => {
    const newDate = new Date(currentDate);
    newDate.setDate(newDate.getDate() + 7);
    setCurrentDate(newDate);
  };

  const isAR = (vt) =>
    vt === 'AR Violation' || vt === 'AR Shortage';

  const arViolations = violations.filter((v) =>
    isAR(v.violation_type)
  );

  const scanningViolations = violations.filter(
    (v) => v.violation_type === 'Scanning Violation'
  );

  const tabs = [
    {
      key: 'ar',
      label: 'AR Violations',
      count: arViolations.length,
    },
    {
      key: 'scanning',
      label: 'Scanning Violations',
      count: scanningViolations.length,
    },
    {
      key: 'disqualified',
      label: 'Disqualified Policies',
      count: disqualifiedPolicies.length,
    },
  ];

  const getCurrentData = () => {
    if (activeTab === 'ar') return arViolations;
    if (activeTab === 'scanning') return scanningViolations;
    return disqualifiedPolicies;
  };

  return (
    <div className={styles.containerModern}>
      <div className={styles.topHeader}>
        <div className={styles.dateNavigator}>
          <button onClick={goToPreviousWeek}>
            &larr; Previous Week
          </button>

          <h2>
            Violations for{' '}
            {new Date(
              week.start + 'T12:00:00'
            ).toLocaleDateString()}{' '}
            -{' '}
            {new Date(
              week.end + 'T12:00:00'
            ).toLocaleDateString()}
          </h2>

          <button onClick={goToNextWeek}>
            Next Week &rarr;
          </button>
        </div>

        <button
          className={styles.newButton}
          onClick={() => navigate('/admin/enter-violation')}
        >
          + Enter New Violation
        </button>
      </div>

      <div className={styles.summaryCards}>
        <div className={styles.summaryCard}>
          <span>AR Violations</span>
          <strong>{arViolations.length}</strong>
        </div>

        <div className={styles.summaryCard}>
          <span>Scanning Violations</span>
          <strong>{scanningViolations.length}</strong>
        </div>

        <div className={styles.summaryCard}>
          <span>Disqualified Policies</span>
          <strong>{disqualifiedPolicies.length}</strong>
        </div>
      </div>

      <div className={styles.tabsContainer}>
        {tabs.map((tab) => (
          <button
            key={tab.key}
            className={`${styles.tabButton} ${
              activeTab === tab.key
                ? styles.activeTab
                : ''
            }`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}

            <span className={styles.tabCount}>
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className={styles.loadingCard}>
          Loading violations...
        </div>
      ) : (
        <ViolationTable
          violations={getCurrentData()}
          onStatusChange={handleStatusChange}
          agentNameMap={agentNameMap}
          onEdit={handleEdit}
          onDelete={handleDelete}
          type={activeTab}
        />
      )}
    </div>
  );
};

export default ManageViolations;