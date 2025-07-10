import { describe, it, expect } from "vitest";
import { extractDomain } from "./domain";

describe("extractDomain", () => {
  describe("Full URLs", () => {
    it("should extract domain from https URL", () => {
      expect(extractDomain("https://www.google.com")).toBe("google.com");
    });

    it("should extract domain from http URL", () => {
      expect(extractDomain("http://www.example.com")).toBe("example.com");
    });

    it("should extract domain from URL with port", () => {
      expect(extractDomain("reactnative.dev")).toBe("reactnative.dev");
    });

    it("should extract domain from URL with path", () => {
      expect(extractDomain("https://www.github.com/user/repo")).toBe(
        "github.com"
      );
    });

    it("should extract domain from URL with query parameters", () => {
      expect(extractDomain("https://www.google.com/search?q=test")).toBe(
        "google.com"
      );
    });

    it("should extract domain from URL with port", () => {
      expect(extractDomain("https://www.example.com:8080/path")).toBe(
        "example.com"
      );
    });
  });

  describe("Domain names without protocol", () => {
    it("should extract domain from simple domain", () => {
      expect(extractDomain("google.com")).toBe("google.com");
    });

    it("should extract domain from subdomain", () => {
      expect(extractDomain("www.example.com")).toBe("example.com");
    });

    it("should extract domain from multiple subdomains", () => {
      expect(extractDomain("api.v1.example.com")).toBe("example.com");
    });
  });

  describe("Different TLD formats", () => {
    it("should handle country code TLDs", () => {
      expect(extractDomain("https://www.example.co.uk")).toBe("co.uk");
    });

    it("should handle long TLDs", () => {
      expect(extractDomain("https://www.example.museum")).toBe(
        "example.museum"
      );
    });

    it("should handle new gTLDs", () => {
      expect(extractDomain("https://www.example.tech")).toBe("example.tech");
    });
  });

  describe("Edge cases", () => {
    it("should handle localhost", () => {
      expect(extractDomain("http://localhost:3000")).toBe("localhost");
    });

    it("should handle single part domain", () => {
      expect(extractDomain("localhost")).toBe("localhost");
    });

    it("should handle IP addresses", () => {
      expect(extractDomain("http://192.168.1.1:8080")).toBe("192.168.1.1");
    });

    it("should handle empty subdomain", () => {
      expect(extractDomain("https://example.com")).toBe("example.com");
    });
  });

  describe("Error handling", () => {
    it("should return 'unknown' for invalid URLs", () => {
      expect(extractDomain("not-a-url")).toBe("unknown");
    });

    it("should return 'unknown' for empty string", () => {
      expect(extractDomain("")).toBe("unknown");
    });

    it("should return 'unknown' for malformed URLs", () => {
      expect(extractDomain("://invalid")).toBe("unknown");
    });
  });
});
