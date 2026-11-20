package com.railflow.web;

import java.nio.file.Files;
import java.nio.file.Path;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.ViewControllerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * Serves the existing build-free frontend from the backend so the page and {@code /api/mvp} share
 * one origin (docs/design/mvp-contract.md §5). The directory defaults to {@code src/frontend}
 * relative to the working directory and can be overridden with {@code --railflow.frontend.dir=...}.
 *
 * <p>Only the web profile mounts static files; schema/import commands stay non-web. The default
 * classpath static mapping remains disabled ({@code spring.web.resources.add-mappings=false}), so
 * nothing outside the configured directory is exposed.
 */
@Configuration
@Profile("web")
public class WebStaticConfig implements WebMvcConfigurer {

    private static final Logger log = LoggerFactory.getLogger(WebStaticConfig.class);

    private final Path frontendDir;

    public WebStaticConfig(@Value("${railflow.frontend.dir:src/frontend}") String frontendDir) {
        this.frontendDir = Path.of(frontendDir).toAbsolutePath().normalize();
        if (!Files.isDirectory(this.frontendDir)) {
            log.warn("frontend directory not found: {} (pass --railflow.frontend.dir=...)",
                    this.frontendDir);
        }
    }

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        String location = frontendDir.toUri().toString();
        registry.addResourceHandler("/**").addResourceLocations(location);
    }

    @Override
    public void addViewControllers(ViewControllerRegistry registry) {
        registry.addViewController("/").setViewName("forward:/index.html");
    }
}
