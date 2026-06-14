#!/usr/bin/env ruby
# frozen_string_literal: true

require "fileutils"
require "date"
require "yaml"

repo_root = File.expand_path("..", __dir__)
source_dir = ARGV[0] || ENV["ARCHIVOS_STAGED_ARCHIVE_DIR"]

unless source_dir && Dir.exist?(source_dir)
  warn "Usage: ruby scripts/import-staged-archive-records.rb /path/to/site-record-candidates/archives"
  exit 1
end

public_fields = %w[
  title
  titleEng
  desc-es
  desc-en
  author
  topic
  type
  date
  thumbnail
  link
  layout
  tags
]

skip_filenames = [
  "fotografías-actuales-de-la-hidroeléctrica-en-la-vuelta-2024.md"
]

dest_dir = File.join(repo_root, "archives")
FileUtils.mkdir_p(dest_dir)

written = 0
skipped = 0

Dir.glob(File.join(source_dir, "*.md")).sort.each do |source_path|
  filename = File.basename(source_path)
  if skip_filenames.include?(filename)
    skipped += 1
    next
  end

  text = File.read(source_path)
  match = text.match(/\A---\s*\n(.*?)\n---\s*/m)
  unless match
    warn "Skipping #{filename}: no YAML front matter"
    skipped += 1
    next
  end

  data = YAML.safe_load(
    match[1],
    permitted_classes: [Date, Time],
    aliases: true
  ) || {}

  clean = {}
  public_fields.each do |field|
    value = data[field]
    next if value.nil?
    next if value.respond_to?(:empty?) && value.empty?

    clean[field] = value
  end

  clean["layout"] ||= "archive.njk"
  clean["tags"] ||= ["archives"]

  dest_path = File.join(dest_dir, filename)
  File.write(dest_path, ["---", clean.to_yaml.sub(/\A---\s*\n/, "").strip, "---", ""].join("\n"))
  written += 1
end

puts "Wrote #{written} archive records to #{dest_dir}"
puts "Skipped #{skipped} records"
