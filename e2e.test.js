import "dotenv/config";

import assert from "node:assert/strict";
import { exec } from "node:child_process";
import { randomUUID } from "node:crypto";
import { after, describe, it } from "node:test";

import { auth, sheets } from "@googleapis/sheets";

const sheetsClient = authenticatedClient();
const spreadsheetId = process.env.SPREADSHEET_ID;

describe("GitHub Tracker", () => {
	const sheetsToDelete = [];

	after(async () => {
		if (sheetsToDelete.length > 0) {
			await sheetsClient.spreadsheets.batchUpdate({
				requestBody: {
					requests: sheetsToDelete.map((sheetId) => ({ deleteSheet: { sheetId } })),
				},
				spreadsheetId,
			});
		}
	});

	it("works with a real spreadsheet", async () => {
		const title = await createSheet([
			["GitHub ID", "Commits last week"],
			["textbook"],
			["haroon-ali-dev"],
			["definitely-does-not-exist-as-a-user-1"],
			["definitely-does-not-exist-as-a-user-2"],
			["momahboobian"],
			["LorenaCapraru"],
		]);

		await runScript({ END_DATE: "2023-06-18", WORKSHEET_NAME: title });

		const { data: { values } } = await sheetsClient.spreadsheets.values.get({
			range: `${title}!A2:B`,
			spreadsheetId,
		});
		const commitCounts = Object.fromEntries(values);
		assert.deepEqual(commitCounts, {
			"definitely-does-not-exist-as-a-user-1": "#N/A",
			"definitely-does-not-exist-as-a-user-2": "#N/A",
			"haroon-ali-dev": "96",
			LorenaCapraru: "2",
			momahboobian: "3",
			textbook: "1",
		});
	});

	it("works with inconsistent casing", async () => {
		const title = await createSheet([
			["GitHub ID", "Commits last week"],
			["tExTbOoK"],
			["Haroon-Ali-DEV"],
			["MOMAHBOOBIAN"],
			["lorenacapraru"],
		]);

		await runScript({ END_DATE: "2023-06-18", WORKSHEET_NAME: title });

		const { data: { values } } = await sheetsClient.spreadsheets.values.get({
			range: `${title}!A2:B`,
			spreadsheetId,
		});
		const commitCounts = Object.fromEntries(values);
		assert.deepEqual(commitCounts, {
			"Haroon-Ali-DEV": "96",
			lorenacapraru: "2",
			MOMAHBOOBIAN: "3",
			tExTbOoK: "1",
		});
	});

	/**
	 * @param {string[][]} values
	 * @returns {Promise<string>}
	 */
	async function createSheet(values) {
		const { data: { replies: [{ addSheet }] } } = await sheetsClient.spreadsheets.batchUpdate({
			requestBody: {
				requests: [
					{ addSheet: { properties: { title: `Test ${randomUUID()}` } } },
				],
			},
			spreadsheetId,
		});
		const { sheetId, title } = addSheet.properties;
		sheetsToDelete.push(sheetId);
		await sheetsClient.spreadsheets.values.update({
			range: `${title}!A:Z`,
			requestBody: { values },
			spreadsheetId,
			valueInputOption: "USER_ENTERED",
		});
		return title;
	}
});

/**
 * @returns {import("@googleapis/sheets").sheets_v4.Sheets}
 */
function authenticatedClient() {
	/** @type {any} - for some reason this doesn't typecheck */
	const googleAuth = auth.fromJSON(JSON.parse(process.env.GOOGLE_CREDENTIALS ?? "{}"));
	return sheets({ auth: googleAuth, version: "v4" });
}

/**
 * @param {Record<string, string>} env
 * @returns {Promise<void>}
 */
function runScript(env) {
	return new Promise((resolve, reject) => exec(
		"node cli.js",
		{ env: { ...process.env, ...env } },
		(err, stdout, stderr) => {
			if (err) {
				console.error(stderr);
				reject(err);
			} else {
				console.log(stdout);
				resolve();
			}
		},
	));
}
