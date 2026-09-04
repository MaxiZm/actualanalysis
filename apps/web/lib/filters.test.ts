import { describe, expect, it } from "vitest";
import { DEFAULT_FILTERS, parseFilters, serializeFilters } from "./filters";

describe("explorer URL filters", () => {
  it("round-trips multi-value filters and caps highlights at eight", () => {
    const input={...DEFAULT_FILTERS,index:"agentic" as const,organizations:["A","B"],openWeights:true,reasoning:"high",sizeClass:"frontier",release:"2025",maxPrice:4.5,highlight:Array.from({length:10},(_,i)=>`m${i}`)};
    const parsed=parseFilters(serializeFilters(input));
    expect(parsed).toMatchObject({...input,highlight:input.highlight.slice(0,8)});
  });

  it("fails closed to mixed and ignores invalid prices", () => {
    expect(parseFilters(new URLSearchParams("index=wrong&maxPrice=nope"))).toMatchObject({index:"mixed",maxPrice:null});
  });
});
