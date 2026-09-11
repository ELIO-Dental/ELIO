import {
  Badge,
  EmptyState,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TablePanel,
  TableRow,
} from "@elio/ui";
import type { DentistOccupancy } from "@/lib/dentally-occupancy-service";

function hrs(mins: number): string {
  return (mins / 60).toFixed(1);
}

function occupancyVariant(percent: number): "success" | "warning" | "danger" {
  if (percent >= 70) return "success";
  if (percent >= 40) return "warning";
  return "danger";
}

export function OccupancyTable({ rows }: { rows: DentistOccupancy[] }) {
  if (rows.length === 0) {
    return (
      <TablePanel>
        <EmptyState
          title="No dentists to report on"
          description="Active dentists need a linked Dentally practitioner id before occupancy can be calculated."
          className="py-12"
        />
      </TablePanel>
    );
  }

  return (
    <TablePanel>
      <Table data-testid="occupancy-table">
        <TableHeader>
          <TableRow>
            <TableHead>Dentist</TableHead>
            <TableHead className="text-right">Available (hrs)</TableHead>
            <TableHead className="text-right">Booked (hrs)</TableHead>
            <TableHead className="text-right">White space (hrs)</TableHead>
            <TableHead className="text-right">Occupancy</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.dentistId}>
              <TableCell>{row.dentistName}</TableCell>
              <TableCell className="text-right tabular-nums">{hrs(row.totalAvailableMins)}</TableCell>
              <TableCell className="text-right tabular-nums">{hrs(row.totalBookedMins)}</TableCell>
              <TableCell className="text-right tabular-nums">{hrs(row.totalWhiteSpaceMins)}</TableCell>
              <TableCell className="text-right">
                <Badge variant={occupancyVariant(row.occupancyPercent)}>{row.occupancyPercent}%</Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TablePanel>
  );
}
