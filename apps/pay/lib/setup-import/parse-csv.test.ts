import { describe, expect, it } from "vitest";
import { parseCsvText } from "./parse-csv";
import { previewEntityImportFromCsv } from "./import-entities";
import { previewDentistImport } from "./import-dentists";

describe("setup import parse-csv", () => {
  it("parses tab-separated rows", () => {
    const parsed = parseCsvText("name\tamount\nAcme\t10");
    expect(parsed.headers).toEqual(["name", "amount"]);
    expect(parsed.rows[0]).toEqual(["Acme", "10"]);
  });

  it("validates lab import rows", () => {
    const preview = previewEntityImportFromCsv(
      "name,account_name,sort_code,account_number\nAcme Lab,Acme Ltd,11-22-33,12345678"
    );
    expect(preview.valid).toHaveLength(1);
    expect(preview.valid[0]?.name).toBe("Acme Lab");
  });

  it("validates dentist import rows", () => {
    const preview = previewDentistImport(
      'name,pay_type,private_split_percent,uda_rate,hourly_rate,nhs_performer_number,dentally_practitioner_id\n"Dr A","PERCENTAGE_SPLIT","50","25.00",,,"1"'
    );
    expect(preview.valid).toHaveLength(1);
    expect(preview.valid[0]?.udaRatePence).toBe(2500);
  });
});
