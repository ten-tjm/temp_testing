//DO NOT RUN THIS AS IS


/* 	@author Tyler J. Mitchell
* 	@version 0.1
*	@description This produces a set of SQL queries to run when soft deleting an account. 
*	@notes/questions 
		1) Should this reassign trackers to the Tenna inventory, or should that be done later, once we get the trackers back?
		2) Currently forces the person that will run this to manually lookup the account id, rather than pulling it from the database, is this the prefered behavior?
		3) Uses timestamps as an "undelete" method, this is not perfect, but should work without an issue. It would be better to have a "delete" id, that could be referenced instead
			this would allow for better record keeping (this account was deleted at time and date X, and then undeleted later) with the current method we lose this information
		4) There are several tables with data that is associated with an account, but those tables lack a deleted_at column, as such they have been ignored for this work
			(	account_calendars account_integrations account_licenses account_modules account_user_roles agreement_signs asset_properties_audit asset_rental_history 
				asset_request_conflicts asset_revisions asset_utilization_lifetime asset_utilization_monthly asset_utilization_quarterly
				asset_utilization_weekly asset_utilization_yearly asset_work_hours_weekly audits bulkupload_items bulkuploads consumable_asset_transactions 
				contact_organization_associations geofence_alerts permissions role_permissions roles site_contacts sites spatial_ref_sys titles
				user_filters usergroups utilization_asset_life_to_date_start utilization_asset_site_assignments utilization_daily_total_duration utilization_processed_trips
			)
		5) There are several tables with delted_at columns, but no data has ever been deleted from these tables, they have also been ignored. 
			(	addresses aemp_fault_codes aemp_issues asset_request_decisions geofence_breaches insights_data tracker_allocation_orders
				tracker_events tracker_problems trip_events trip_stats user_settings 
			)
		6) This should not be run as is, I need to double check the status of the trackers (if they have any) for each of these accounts, 
			and make sure we are either removing them, or assigning them back to TENNA
*/



"use strict";
const config = require("../config")[process.env.NODE_ENV];
const { runRawQueriesT } = require("@tenna-llc/be-shared-utils");

const info = {
  name: "Account Soft Deletes",
  created: "2022-1-24",
  comment:
    "Soft deleting accounts, from production."
};

// Look up the name to get the ID, if there is a typo in the name, this will help find it
//	The Toro Company, 227c2c85-5c06-4331-bc8b-a5bd79854515
//	JR Cruz Demo, e8f4fac4-773b-4010-bcb5-e218a2cb22b4
//	Southwestern Energy Services, 303c4cb3-e9ff-44b9-b13f-e086552e3e27
//	Jobsite Technologies Inc., 02f36790-9ea5-458f-8f54-66a6efbc6e54
//	Empire Paving Inc, fb3b507b-82ae-4406-bae5-f7fec5b633c9
//	Garrity Asphalt Reclaiming, b8cfb663-4a1a-49c3-ae03-eedd3d71bfac
//	TEST COMPANY - SF, 62b98e44-fc0b-469c-aec4-11b1ddf4e9c4
//	Tiger Construction, 4312cc61-feda-4cf9-8a17-7d8daef9acf0
//	Pace Analytical ( Pace Labs ), af337faf-5b0c-4666-930e-88148ccb9030
//	Taracon Precast, a161693e-2004-4eca-9e7b-b7167f047136
//	American Leak Detection, 0d91b229-6663-4cac-9460-5dbb5da404d3
//	Brighton Builders, 569bea02-9e36-485c-bbd0-35f303a34657
//	Stellos Electric, 8d86b143-d3c5-484a-8a86-408cb737ae74
//	Ashlar Mechanical, 32e8232b-d7ef-41e7-a502-a559a9da4ba4

// We use a constant here for Date/time because it makes all the entires be deleted at the same time, this simplifies undelete later
const deleteTime = Date.now();
// This is an example value, do not use this, update it to be the time you wante to undelete, This could be modified to work in a range, instead. However I think a single 
// time makes everything easier to track
const unDeleteTime = 1643034569760;

/*This would be the minimum sql to remove an account from view
* 1) Break the association between trackers and this account
* 2) break the association between trackers and thier assets for this account
* 3) Set the account to deleted
* 4) Set their users to deleted
* 
* Limit the update to only things that are not already deleted. i.e. don't update an already deleted entry, this would make undelete more complicated/impossible
*/
const getMinDeleteCommand = ({ accountID }) =>
`
	update tracker_asset_associations t set t.deleted_at = (to_timestamp(${deleteTime} / 1000.0)) where t.tracker_account_association_id in (select t2.id from tracker_account_associations t2 where t2.account_id = '${accountID}' and t2.deleted_at is null) and t.deleted_at is null;
	update tracker_account_associations t set t.deleted_at = (to_timestamp(${deleteTime} / 1000.0)) where t.account_id = '${accountID}') and t.deleted_at is null;
	update users t set t.deleted_at = (to_timestamp(${deleteTime} / 1000.0)) where t.account_id = '${accountID}') and t.deleted_at is null;
	update accounts t set t.deleted_at = (to_timestamp(${deleteTime} / 1000.0)) where t.account_id = '${accountID}') and t.deleted_at is null;
`
const getMinUnDeleteCommand = ({ accountID }) =>
`
	update tracker_asset_associations t set t.deleted_at = null where t.tracker_account_association_id in (select t2.id from tracker_account_associations t2 where t2.account_id = '${accountID}' and t2.deleted_at is null) and t.deleted_at = (to_timestamp(${unDeleteTime} / 1000.0));
	update tracker_account_associations t set t.deleted_at = null where t.account_id = '${accountID}') and t.deleted_at = (to_timestamp(${unDeleteTime} / 1000.0));
	update users t set t.deleted_at = null where t.account_id = '${accountID}') and t.deleted_at = (to_timestamp(${unDeleteTime} / 1000.0));
	update accounts t set t.deleted_at = null where t.account_id = '${accountID}') and t.deleted_at = (to_timestamp(${unDeleteTime} / 1000.0));
`

// Assets, trackers, users, and accounts are deleted last
// Trackers should only be deleted if we're not expecting them back from the customer
// The full deletes also deletes the trackers
const getFullDeleteSqlCommand = ({ accountID }) =>
`
	update account_contacts t set t.deleted_at = (to_timestamp(${deleteTime} / 1000.0)) where t.account_id = '${accountID}') and t.deleted_at is null;
	update asset_requests t set t.deleted_at = (to_timestamp(${deleteTime} / 1000.0)) where t.account_id = '${accountID}') and t.deleted_at is null;
	update attachments t set t.deleted_at = (to_timestamp(${deleteTime} / 1000.0)) where t.account_id = '${accountID}') and t.deleted_at is null;
	update categories t set t.deleted_at = (to_timestamp(${deleteTime} / 1000.0)) where t.account_id = '${accountID}') and t.deleted_at is null;
	update contacts t set t.deleted_at = (to_timestamp(${deleteTime} / 1000.0)) where t.account_id = '${accountID}') and t.deleted_at is null;
	update geofences t set t.deleted_at = (to_timestamp(${deleteTime} / 1000.0)) where t.account_id = '${accountID}') and t.deleted_at is null;
	update organizations t set t.deleted_at = (to_timestamp(${deleteTime} / 1000.0)) where t.account_id = '${accountID}') and t.deleted_at is null;
	update trips t set t.deleted_at = (to_timestamp(${deleteTime} / 1000.0)) where t.account_id = '${accountID}') and t.deleted_at is null;
	update asset_dt_codes t set t.deleted_at = (to_timestamp(${deleteTime} / 1000.0)) where t.asset_id in (select t2.id from assets t2 where t2.id = '${accountID}' and t2.deleted_at is null) and t.deleted_at is null;
	update asset_properties t set t.deleted_at = (to_timestamp(${deleteTime} / 1000.0)) where t.asset_id in (select t2.id from assets t2 where t2.id = '${accountID}' and t2.deleted_at is null) and t.deleted_at is null;
	update fuel_entries t set t.deleted_at = (to_timestamp(${deleteTime} / 1000.0)) where t.asset_id in (select t2.id from assets t2 where t2.id = '${accountID}' and t2.deleted_at is null) and t.deleted_at is null;
	update asset_contact_associations t set t.deleted_at = (to_timestamp(${deleteTime} / 1000.0)) where t.asset_id in (select t2.id from assets t2 where t2.id = '${accountID}' and t2.deleted_at is null) and t.deleted_at is null;
	update user_reports t set t.deleted_at = (to_timestamp(${deleteTime} / 1000.0)) where t.user_id in (select t2.id from users t2 where t2.account_id = '${accountID}' and t2.deleted_at is null) and t.deleted_at is null;
	update tracker_allocation_sessions t set t.deleted_at = (to_timestamp(${deleteTime} / 1000.0)) where t.tracker_allocation_order_id in (select t2.id from tracker_allocation_orders t2 where t2.account_id = '${accountID}' and t2.deleted_at is null) and t.deleted_at is null;
	update tracker_asset_associations t set t.deleted_at = (to_timestamp(${deleteTime} / 1000.0)) where t.tracker_account_association_id in (select t2.id from tracker_account_associations t2 where t2.account_id = '${accountID}' and t2.deleted_at is null) and t.deleted_at is null;
	update tracker_allocation_session_items t set t.deleted_at = (to_timestamp(${deleteTime} / 1000.0)) where t.tracker_id in (select t2.tracker_id from tracker_account_associations t2 where t2.account_id = '${accountID}' and t2.deleted_at is null) and t.deleted_at is null;
	update trackers t set t.deleted_at = (to_timestamp(${deleteTime} / 1000.0)) where t.id in (select t2.tracker_id from tracker_account_associations t2 where t2.account_id = '${accountID}' and t2.deleted_at is null) and t.deleted_at is null;
	update tracker_account_associations t set t.deleted_at = (to_timestamp(${deleteTime} / 1000.0)) where t.account_id = '${accountID}') and t.deleted_at is null;
	update assets t set t.deleted_at = (to_timestamp(${deleteTime} / 1000.0)) where t.account_id = '${accountID}') and t.deleted_at is null;
	update users t set t.deleted_at = (to_timestamp(${deleteTime} / 1000.0)) where t.account_id = '${accountID}') and t.deleted_at is null;
	update accounts t set t.deleted_at = (to_timestamp(${deleteTime} / 1000.0)) where t.account_id = '${accountID}') and t.deleted_at is null;
`;

const getFullUnDeleteSqlCommand = ({ accountID }) =>
`
	update account_contacts t set t.deleted_at = null where t.account_id = '${accountID}') and t.deleted_at = (to_timestamp(${unDeleteTime} / 1000.0));
	update asset_requests t set t.deleted_at = null where t.account_id = '${accountID}') and t.deleted_at = (to_timestamp(${unDeleteTime} / 1000.0));
	update attachments t set t.deleted_at = null where t.account_id = '${accountID}') and t.deleted_at = (to_timestamp(${unDeleteTime} / 1000.0));
	update categories t set t.deleted_at = null where t.account_id = '${accountID}') and t.deleted_at = (to_timestamp(${unDeleteTime} / 1000.0));
	update contacts t set t.deleted_at = null where t.account_id = '${accountID}') and t.deleted_at = (to_timestamp(${unDeleteTime} / 1000.0));
	update geofences t set t.deleted_at = null where t.account_id = '${accountID}') and t.deleted_at = (to_timestamp(${unDeleteTime} / 1000.0));
	update organizations t set t.deleted_at = null where t.account_id = '${accountID}') and t.deleted_at = (to_timestamp(${unDeleteTime} / 1000.0));
	update trips t set t.deleted_at = null where t.account_id = '${accountID}') and t.deleted_at = (to_timestamp(${unDeleteTime} / 1000.0));
	update asset_contact_associations t set t.deleted_at = null where t.asset_id in (select t2.id from assets t2 where t2.id = '${accountID}' and t2.deleted_at = (to_timestamp(${unDeleteTime} / 1000.0))) and t.deleted_at = (to_timestamp(${unDeleteTime} / 1000.0));
	update asset_dt_codes t set t.deleted_at = null where t.asset_id in (select t2.id from assets t2 where t2.id = '${accountID}' and t2.deleted_at = (to_timestamp(${unDeleteTime} / 1000.0))) and t.deleted_at = (to_timestamp(${unDeleteTime} / 1000.0));
	update asset_properties t set t.deleted_at = null where t.asset_id in (select t2.id from assets t2 where t2.id = '${accountID}' and t2.deleted_at = (to_timestamp(${unDeleteTime} / 1000.0))) and t.deleted_at = (to_timestamp(${unDeleteTime} / 1000.0));
	update fuel_entries t set t.deleted_at = null where t.asset_id in (select t2.id from assets t2 where t2.id = '${accountID}' and t2.deleted_at = (to_timestamp(${unDeleteTime} / 1000.0))) and t.deleted_at = (to_timestamp(${unDeleteTime} / 1000.0));
	update user_reports t set t.deleted_at = null where t.user_id in (select t2.id from users t2 where t2.account_id = '${accountID}' and t2.deleted_at = (to_timestamp(${unDeleteTime} / 1000.0))) and t.deleted_at = (to_timestamp(${unDeleteTime} / 1000.0));
	update tracker_allocation_sessions t set t.deleted_at = null where t.tracker_allocation_order_id in (select t2.id from tracker_allocation_orders t2 where t2.account_id = '${accountID}' and t2.deleted_at = (to_timestamp(${unDeleteTime} / 1000.0))) and t.deleted_at = (to_timestamp(${unDeleteTime} / 1000.0));
	update tracker_asset_associations t set t.deleted_at = null where t.tracker_account_association_id in (select t2.id from tracker_account_associations t2 where t2.account_id = '${accountID}' and t2.deleted_at = (to_timestamp(${unDeleteTime} / 1000.0))) and t.deleted_at = (to_timestamp(${unDeleteTime} / 1000.0));
	update tracker_allocation_session_items t set t.deleted_at = null where t.tracker_id in (select t2.tracker_id from tracker_account_associations t2 where t2.account_id = '${accountID}' and t2.deleted_at = (to_timestamp(${unDeleteTime} / 1000.0))) and t.deleted_at = (to_timestamp(${unDeleteTime} / 1000.0));
	update trackers t set t.deleted_at = null where t.id in (select t2.tracker_id from tracker_account_associations t2 where t2.account_id = '${accountID}' and t2.deleted_at = (to_timestamp(${unDeleteTime} / 1000.0))) and t.deleted_at = (to_timestamp(${unDeleteTime} / 1000.0));
	update tracker_account_associations t set t.deleted_at = null where t.account_id = '${accountID}') and t.deleted_at = (to_timestamp(${unDeleteTime} / 1000.0));
	update assets t set t.deleted_at = null where t.account_id = '${accountID}') and t.deleted_at = (to_timestamp(${unDeleteTime} / 1000.0));
	update users t set t.deleted_at = null where t.account_id = '${accountID}') and t.deleted_at = (to_timestamp(${unDeleteTime} / 1000.0));
	update accounts t set t.deleted_at = null where t.account_id = '${accountID}') and t.deleted_at = (to_timestamp(${unDeleteTime} / 1000.0));
`;


/*
* This should be the default behavior, soft delete entires related to the account, but assume the trackers will return to our inventory
*/
const getAccountDeleteSqlCommand = ({ accountID }) =>
`
	update account_contacts t set t.deleted_at = (to_timestamp(${deleteTime} / 1000.0)) where t.account_id = '${accountID}') and t.deleted_at is null;
	update asset_requests t set t.deleted_at = (to_timestamp(${deleteTime} / 1000.0)) where t.account_id = '${accountID}') and t.deleted_at is null;
	update attachments t set t.deleted_at = (to_timestamp(${deleteTime} / 1000.0)) where t.account_id = '${accountID}') and t.deleted_at is null;
	update categories t set t.deleted_at = (to_timestamp(${deleteTime} / 1000.0)) where t.account_id = '${accountID}') and t.deleted_at is null;
	update contacts t set t.deleted_at = (to_timestamp(${deleteTime} / 1000.0)) where t.account_id = '${accountID}') and t.deleted_at is null;
	update geofences t set t.deleted_at = (to_timestamp(${deleteTime} / 1000.0)) where t.account_id = '${accountID}') and t.deleted_at is null;
	update organizations t set t.deleted_at = (to_timestamp(${deleteTime} / 1000.0)) where t.account_id = '${accountID}') and t.deleted_at is null;
	update trips t set t.deleted_at = (to_timestamp(${deleteTime} / 1000.0)) where t.account_id = '${accountID}') and t.deleted_at is null;
	update asset_dt_codes t set t.deleted_at = (to_timestamp(${deleteTime} / 1000.0)) where t.asset_id in (select t2.id from assets t2 where t2.id = '${accountID}' and t2.deleted_at is null) and t.deleted_at is null;
	update asset_properties t set t.deleted_at = (to_timestamp(${deleteTime} / 1000.0)) where t.asset_id in (select t2.id from assets t2 where t2.id = '${accountID}' and t2.deleted_at is null) and t.deleted_at is null;
	update fuel_entries t set t.deleted_at = (to_timestamp(${deleteTime} / 1000.0)) where t.asset_id in (select t2.id from assets t2 where t2.id = '${accountID}' and t2.deleted_at is null) and t.deleted_at is null;
	update asset_contact_associations t set t.deleted_at = (to_timestamp(${deleteTime} / 1000.0)) where t.asset_id in (select t2.id from assets t2 where t2.id = '${accountID}' and t2.deleted_at is null) and t.deleted_at is null;
	update user_reports t set t.deleted_at = (to_timestamp(${deleteTime} / 1000.0)) where t.user_id in (select t2.id from users t2 where t2.account_id = '${accountID}' and t2.deleted_at is null) and t.deleted_at is null;
	update tracker_allocation_sessions t set t.deleted_at = (to_timestamp(${deleteTime} / 1000.0)) where t.tracker_allocation_order_id in (select t2.id from tracker_allocation_orders t2 where t2.account_id = '${accountID}' and t2.deleted_at is null) and t.deleted_at is null;
	update tracker_asset_associations t set t.deleted_at = (to_timestamp(${deleteTime} / 1000.0)) where t.tracker_account_association_id in (select t2.id from tracker_account_associations t2 where t2.account_id = '${accountID}' and t2.deleted_at is null) and t.deleted_at is null;
	update tracker_allocation_session_items t set t.deleted_at = (to_timestamp(${deleteTime} / 1000.0)) where t.tracker_id in (select t2.tracker_id from tracker_account_associations t2 where t2.account_id = '${accountID}' and t2.deleted_at is null) and t.deleted_at is null;
	update tracker_account_associations t set t.deleted_at = (to_timestamp(${deleteTime} / 1000.0)) where t.account_id = '${accountID}') and t.deleted_at is null;
	update assets t set t.deleted_at = (to_timestamp(${deleteTime} / 1000.0)) where t.account_id = '${accountID}') and t.deleted_at is null;
	update users t set t.deleted_at = (to_timestamp(${deleteTime} / 1000.0)) where t.account_id = '${accountID}') and t.deleted_at is null;
	update accounts t set t.deleted_at = (to_timestamp(${deleteTime} / 1000.0)) where t.account_id = '${accountID}') and t.deleted_at is null;
`;

const getAccountUnDeleteSqlCommand = ({ accountID }) =>
`
	update account_contacts t set t.deleted_at = null where t.account_id = '${accountID}') and t.deleted_at = (to_timestamp(${unDeleteTime} / 1000.0));
	update asset_requests t set t.deleted_at = null where t.account_id = '${accountID}') and t.deleted_at = (to_timestamp(${unDeleteTime} / 1000.0));
	update attachments t set t.deleted_at = null where t.account_id = '${accountID}') and t.deleted_at = (to_timestamp(${unDeleteTime} / 1000.0));
	update categories t set t.deleted_at = null where t.account_id = '${accountID}') and t.deleted_at = (to_timestamp(${unDeleteTime} / 1000.0));
	update contacts t set t.deleted_at = null where t.account_id = '${accountID}') and t.deleted_at = (to_timestamp(${unDeleteTime} / 1000.0));
	update geofences t set t.deleted_at = null where t.account_id = '${accountID}') and t.deleted_at = (to_timestamp(${unDeleteTime} / 1000.0));
	update organizations t set t.deleted_at = null where t.account_id = '${accountID}') and t.deleted_at = (to_timestamp(${unDeleteTime} / 1000.0));
	update trips t set t.deleted_at = null where t.account_id = '${accountID}') and t.deleted_at = (to_timestamp(${unDeleteTime} / 1000.0));
	update asset_contact_associations t set t.deleted_at = null where t.asset_id in (select t2.id from assets t2 where t2.id = '${accountID}' and t2.deleted_at = (to_timestamp(${unDeleteTime} / 1000.0))) and t.deleted_at = (to_timestamp(${unDeleteTime} / 1000.0));
	update asset_dt_codes t set t.deleted_at = null where t.asset_id in (select t2.id from assets t2 where t2.id = '${accountID}' and t2.deleted_at = (to_timestamp(${unDeleteTime} / 1000.0))) and t.deleted_at = (to_timestamp(${unDeleteTime} / 1000.0));
	update asset_properties t set t.deleted_at = null where t.asset_id in (select t2.id from assets t2 where t2.id = '${accountID}' and t2.deleted_at = (to_timestamp(${unDeleteTime} / 1000.0))) and t.deleted_at = (to_timestamp(${unDeleteTime} / 1000.0));
	update fuel_entries t set t.deleted_at = null where t.asset_id in (select t2.id from assets t2 where t2.id = '${accountID}' and t2.deleted_at = (to_timestamp(${unDeleteTime} / 1000.0))) and t.deleted_at = (to_timestamp(${unDeleteTime} / 1000.0));
	update user_reports t set t.deleted_at = null where t.user_id in (select t2.id from users t2 where t2.account_id = '${accountID}' and t2.deleted_at = (to_timestamp(${unDeleteTime} / 1000.0))) and t.deleted_at = (to_timestamp(${unDeleteTime} / 1000.0));
	update tracker_allocation_sessions t set t.deleted_at = null where t.tracker_allocation_order_id in (select t2.id from tracker_allocation_orders t2 where t2.account_id = '${accountID}' and t2.deleted_at = (to_timestamp(${unDeleteTime} / 1000.0))) and t.deleted_at = (to_timestamp(${unDeleteTime} / 1000.0));
	update tracker_asset_associations t set t.deleted_at = null where t.tracker_account_association_id in (select t2.id from tracker_account_associations t2 where t2.account_id = '${accountID}' and t2.deleted_at = (to_timestamp(${unDeleteTime} / 1000.0))) and t.deleted_at = (to_timestamp(${unDeleteTime} / 1000.0));
	update tracker_allocation_session_items t set t.deleted_at = null where t.tracker_id in (select t2.tracker_id from tracker_account_associations t2 where t2.account_id = '${accountID}' and t2.deleted_at = (to_timestamp(${unDeleteTime} / 1000.0))) and t.deleted_at = (to_timestamp(${unDeleteTime} / 1000.0));
	update tracker_account_associations t set t.deleted_at = null where t.account_id = '${accountID}') and t.deleted_at = (to_timestamp(${unDeleteTime} / 1000.0));
	update assets t set t.deleted_at = null where t.account_id = '${accountID}') and t.deleted_at = (to_timestamp(${unDeleteTime} / 1000.0));
	update users t set t.deleted_at = null where t.account_id = '${accountID}') and t.deleted_at = (to_timestamp(${unDeleteTime} / 1000.0));
	update accounts t set t.deleted_at = null where t.account_id = '${accountID}') and t.deleted_at = (to_timestamp(${unDeleteTime} / 1000.0));
`;

const softDeleteCommands = [
	{ 	accountID: "227c2c85-5c06-4331-bc8b-a5bd79854515"},
	{	accountID: "e8f4fac4-773b-4010-bcb5-e218a2cb22b4"},
	{	accountID: "303c4cb3-e9ff-44b9-b13f-e086552e3e27"},
	{	accountID: "02f36790-9ea5-458f-8f54-66a6efbc6e54"},
	{	accountID: "fb3b507b-82ae-4406-bae5-f7fec5b633c9"},
	{	accountID: "b8cfb663-4a1a-49c3-ae03-eedd3d71bfac"},
	{	accountID: "62b98e44-fc0b-469c-aec4-11b1ddf4e9c4"},
	{	accountID: "4312cc61-feda-4cf9-8a17-7d8daef9acf0"},
	{	accountID: "af337faf-5b0c-4666-930e-88148ccb9030"},
	{	accountID: "a161693e-2004-4eca-9e7b-b7167f047136"},
	{	accountID: "0d91b229-6663-4cac-9460-5dbb5da404d3"},
	{	accountID: "569bea02-9e36-485c-bbd0-35f303a34657"},
	{	accountID: "8d86b143-d3c5-484a-8a86-408cb737ae74"},
	{	accountID: "32e8232b-d7ef-41e7-a502-a559a9da4ba4"} ].map(getMinDeleteCommand);

const rollbackCommands = [
	{ 	accountID: "227c2c85-5c06-4331-bc8b-a5bd79854515"},
	{	accountID: "e8f4fac4-773b-4010-bcb5-e218a2cb22b4"},
	{	accountID: "303c4cb3-e9ff-44b9-b13f-e086552e3e27"},
	{	accountID: "02f36790-9ea5-458f-8f54-66a6efbc6e54"},
	{	accountID: "fb3b507b-82ae-4406-bae5-f7fec5b633c9"},
	{	accountID: "b8cfb663-4a1a-49c3-ae03-eedd3d71bfac"},
	{	accountID: "62b98e44-fc0b-469c-aec4-11b1ddf4e9c4"},
	{	accountID: "4312cc61-feda-4cf9-8a17-7d8daef9acf0"},
	{	accountID: "af337faf-5b0c-4666-930e-88148ccb9030"},
	{	accountID: "a161693e-2004-4eca-9e7b-b7167f047136"},
	{	accountID: "0d91b229-6663-4cac-9460-5dbb5da404d3"},
	{	accountID: "569bea02-9e36-485c-bbd0-35f303a34657"},
	{	accountID: "8d86b143-d3c5-484a-8a86-408cb737ae74"},
	{	accountID: "32e8232b-d7ef-41e7-a502-a559a9da4ba4"} ].map(getMinUnDeleteCommand);


module.exports = {
  up: runRawQueriesT(getAccountDeleteSqlCommand),
  down: runRawQueriesT(getAccountUnDeleteSqlCommand)
};